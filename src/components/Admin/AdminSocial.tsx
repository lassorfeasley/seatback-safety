import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  ExternalLink,
  Clock,
  Save,
  Palette,
  Calendar,
  ImagePlus,
  Send,
} from 'lucide-react';
import {
  fetchSocialPosts,
  generateSocialPost,
  batchSchedulePosts,
  updateSocialPost,
  deleteSocialPost,
  publishSocialPostNow,
  renderSocialPostPreview,
  type SocialPostWithCard,
  type SocialPost,
} from '@/lib/socialService';
import { useNavigate } from 'react-router-dom';
import { AdminStyleGuide } from './AdminStyleGuide';
import { SocialNewPost } from './SocialNewPost';
import { cn } from '@/lib/utils';

type SocialTab = 'calendar' | 'style-guide' | 'create';

// ─── Calendar Helpers ───────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// ─── Status Badge ───────────────────────────────────────────────

const STATUS_CONFIG: Record<SocialPost['status'], {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}> = {
  draft: { label: 'Draft', variant: 'secondary' },
  scheduled: { label: 'Scheduled', variant: 'default' },
  posted: { label: 'Posted', variant: 'outline' },
  failed: { label: 'Failed', variant: 'destructive' },
};

function StatusBadge({ status }: { status: SocialPost['status'] }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// ─── Crop Preview ───────────────────────────────────────────────

function CropPreview({
  post,
  size = 120,
}: {
  post: SocialPostWithCard;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    if (!post.crop_image_path && !post.panel_image_url) return;

    renderSocialPostPreview(post, post.panel_image_url, size * 2)
      .then((dataUrl) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          setLoaded(true);
        };
        img.src = dataUrl;
      })
      .catch(() => setLoaded(false));
  }, [
    post.panel_image_url,
    post.crop_image_path,
    post.crop_x_pct,
    post.crop_y_pct,
    post.crop_size_pct,
    size,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-md bg-muted flex-shrink-0"
      style={{ width: size, height: size, opacity: loaded ? 1 : 0.3 }}
    />
  );
}

// ─── Post Editor Panel ──────────────────────────────────────────

function PostEditor({
  post,
  onClose,
  onSave,
  onDelete,
  onPublished,
}: {
  post: SocialPostWithCard;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Pick<SocialPost, 'caption' | 'status' | 'scheduled_at'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPublished: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();

  function utcToLocalInput(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const [caption, setCaption] = useState(post.caption ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    utcToLocalInput(post.scheduled_at)
  );
  const [status, setStatus] = useState<SocialPost['status']>(
    post.status === 'failed' ? 'scheduled' : post.status,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setCaption(post.caption ?? '');
    setScheduledAt(utcToLocalInput(post.scheduled_at));
    if (post.status === 'failed') setStatus('scheduled');
    else if (post.status === 'draft' || post.status === 'scheduled') setStatus(post.status);
    else if (post.status === 'posted') setStatus('posted');
  }, [
    post.id,
    post.caption,
    post.scheduled_at,
    post.status,
    post.updated_at,
    post.publish_error,
    post.instagram_permalink,
  ]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(post.id, {
      caption,
      status,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this social post draft?')) return;
    setDeleting(true);
    await onDelete(post.id);
    setDeleting(false);
    onClose();
  };

  const handlePublishInstagram = async () => {
    if (!confirm('Publish this post to Instagram now?')) return;
    setPublishing(true);
    const { error: pubErr } = await publishSocialPostNow(post.id);
    setPublishing(false);
    if (pubErr) {
      window.alert(pubErr);
      return;
    }
    await onPublished(post.id);
  };

  const canPublishToInstagram =
    post.status !== 'posted' && ['draft', 'scheduled', 'failed'].includes(post.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-lg shadow-xl border w-full max-w-2xl max-h-[90vh] overflow-auto m-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Social Post</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-5">
          {/* Crop preview */}
          <div className="flex gap-4 items-start">
            <CropPreview post={post} size={200} />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium">
                {post.card_title ?? 'Untitled Card'}
              </p>
              {post.airline_name && (
                <p className="text-sm text-muted-foreground">{post.airline_name}</p>
              )}
              <button
                onClick={() => navigate(`/admin/cards/${post.card_id}`)}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
              >
                View card <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Caption</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={6}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
            <p className="text-xs text-muted-foreground text-right">
              {caption.length} / 2,200
            </p>
          </div>

          {post.publish_error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <span className="font-medium">Last publish error: </span>
              {post.publish_error}
            </div>
          )}

          {post.status === 'posted' && post.instagram_permalink && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium text-muted-foreground">Instagram: </span>
              <a
                href={post.instagram_permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Open post <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-sm font-medium">Status</label>
                {post.status === 'posted' && <StatusBadge status="posted" />}
                {post.status === 'failed' && <StatusBadge status="failed" />}
              </div>
              {post.status === 'posted' ? (
                <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
                  Published to Instagram. Caption edits here do not sync to Instagram.
                </p>
              ) : (
                <>
                  {post.status === 'failed' && (
                    <p className="text-xs text-muted-foreground">
                      After fixing the issue, save as draft or scheduled, or use Publish to Instagram to retry while
                      still failed.
                    </p>
                  )}
                  <select
                    value={status === 'draft' || status === 'scheduled' ? status : 'scheduled'}
                    onChange={(e) => setStatus(e.target.value as 'draft' | 'scheduled')}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scheduled Date <span className="font-normal text-muted-foreground">(ET)</span></label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="gap-1.5"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
          <div className="flex flex-wrap gap-2 justify-end">
            {canPublishToInstagram && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePublishInstagram}
                disabled={publishing || saving}
                className="gap-1.5"
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Publish to Instagram
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || publishing} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export const AdminSocial: React.FC = () => {
  const [tab, setTab] = useState<SocialTab>('calendar');
  const [posts, setPosts] = useState<SocialPostWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<SocialPostWithCard | null>(null);
  const [showFillSchedule, setShowFillSchedule] = useState(false);
  const [fillStart, setFillStart] = useState('');
  const [fillEnd, setFillEnd] = useState('');
  const [fillTime, setFillTime] = useState('09:00');
  const [filling, setFilling] = useState(false);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const loadPosts = useCallback(async () => {
    const { posts: data, error: err } = await fetchSocialPosts();
    if (err) {
      setError(err);
      setLoading(false);
      return undefined;
    } else {
      setPosts(data ?? []);
      setLoading(false);
      return data ?? [];
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    const { result, error: err } = await generateSocialPost();
    if (err) {
      setError(err);
    } else if (result) {
      await loadPosts();
    }
    setGenerating(false);
  };

  const handleFillSchedule = async () => {
    if (!fillStart || !fillEnd) return;
    setFilling(true);
    setError(null);
    const { count, error: err } = await batchSchedulePosts(fillStart, fillEnd, fillTime);
    if (err) {
      setError(err);
    } else {
      await loadPosts();
      setShowFillSchedule(false);
      setFillStart('');
      setFillEnd('');
      alert(`Scheduled ${count} posts.`);
    }
    setFilling(false);
  };

  const handleSave = async (
    id: string,
    updates: Partial<Pick<SocialPost, 'caption' | 'status' | 'scheduled_at'>>
  ) => {
    const { error: err } = await updateSocialPost(id, updates);
    if (err) {
      setError(err);
    } else {
      await loadPosts();
      setEditingPost(null);
    }
  };

  const handleDelete = async (id: string) => {
    const { error: err } = await deleteSocialPost(id);
    if (err) {
      setError(err);
    } else {
      await loadPosts();
    }
  };

  const handleInstagramPublished = async (id: string) => {
    const list = await loadPosts();
    const fresh = list?.find((p) => p.id === id);
    if (fresh) setEditingPost(fresh);
  };

  // Calendar data
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfWeek(calYear, calMonth);

  const scheduledPostsByDay = new Map<number, SocialPostWithCard[]>();
  for (const post of posts) {
    if (post.scheduled_at) {
      const d = new Date(post.scheduled_at);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        const existing = scheduledPostsByDay.get(day) ?? [];
        existing.push(post);
        scheduledPostsByDay.set(day, existing);
      }
    }
  }

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  return (
    <>
      <header className="flex-shrink-0">
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-medium tracking-widest uppercase text-black/60">Social</h1>
            {tab === 'calendar' && (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    const today = new Date();
                    const nextWeek = new Date(today);
                    nextWeek.setDate(today.getDate() + 7);
                    setFillStart(today.toISOString().slice(0, 10));
                    setFillEnd(nextWeek.toISOString().slice(0, 10));
                    setShowFillSchedule(true);
                  }}
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                >
                  <Calendar className="h-4 w-4" />
                  Fill Schedule
                </Button>
                <Button
                  onClick={handleGenerate}
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={generating}
                  title="Pick a random card and create a draft with OG image"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {generating ? 'Generating...' : 'Random'}
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-4 border-b border-black/5 -mb-5 pb-0">
            <button
              onClick={() => setTab('calendar')}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-[10px] font-medium tracking-widest uppercase border-b-2 -mb-px transition-colors',
                tab === 'calendar'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-black/40 hover:text-black/70'
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Calendar
            </button>
            <button
              onClick={() => setTab('create')}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-[10px] font-medium tracking-widest uppercase border-b-2 -mb-px transition-colors',
                tab === 'create'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-black/40 hover:text-black/70'
              )}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              New post
            </button>
            <button
              onClick={() => setTab('style-guide')}
              className={cn(
                'flex items-center gap-1.5 px-1 py-2 text-[10px] font-medium tracking-widest uppercase border-b-2 -mb-px transition-colors',
                tab === 'style-guide'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-black/40 hover:text-black/70'
              )}
            >
              <Palette className="h-3.5 w-3.5" />
              Style Guide
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {tab === 'style-guide' ? (
            <AdminStyleGuide />
          ) : tab === 'create' ? (
            <SocialNewPost onPostCreated={loadPosts} />
          ) : (
            <>
          {error && (
            <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-md px-4 py-3 text-sm">
              {error}
              <button
                onClick={() => setError(null)}
                className="float-right text-destructive hover:text-destructive/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Calendar Grid */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <Button variant="ghost" size="icon" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-sm font-semibold">
                {MONTH_NAMES[calMonth]} {calYear}
              </h2>
              <Button variant="ghost" size="icon" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-7">
              {DAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-xs font-medium text-muted-foreground text-center border-b"
                >
                  {d}
                </div>
              ))}

              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[72px] border-b border-r last:border-r-0 bg-muted/10" />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayPosts = scheduledPostsByDay.get(day) ?? [];
                const isToday = isSameDay(
                  new Date(calYear, calMonth, day),
                  now
                );

                return (
                  <div
                    key={day}
                    className="min-h-[72px] border-b border-r last:border-r-0 p-1.5 relative"
                  >
                    <span
                      className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {day}
                    </span>
                    {dayPosts.length > 0 && (
                      <div className="mt-0.5 space-y-0.5">
                        {dayPosts.slice(0, 2).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setEditingPost(p)}
                            className="w-full text-left text-[10px] leading-tight truncate rounded px-1 py-0.5 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            {p.airline_name ?? p.card_title ?? 'Post'}
                          </button>
                        ))}
                        {dayPosts.length > 2 && (
                          <span className="text-[10px] text-muted-foreground px-1">
                            +{dayPosts.length - 2} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Post List */}
          <div>
            <h2 className="text-lg font-semibold mb-4">
              All Posts
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({posts.length})
              </span>
            </h2>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Loading posts...</p>
              </div>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div>
                  <h3 className="text-lg font-medium">No social posts yet</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click "Generate Post" to have AI pick a striking crop and write a caption.
                  </p>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="gap-1.5 mt-2"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Generate Post
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => setEditingPost(post)}
                    className="w-full flex items-center gap-4 rounded-lg border bg-card p-3 text-left hover:bg-accent/50 transition-colors"
                  >
                    <CropPreview post={post} size={64} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">
                          {post.card_title ?? 'Untitled Card'}
                        </span>
                        <StatusBadge status={post.status} />
                      </div>
                      {post.airline_name && (
                        <p className="text-xs text-muted-foreground">
                          {post.airline_name}
                        </p>
                      )}
                      {post.caption && (
                        <p className="text-xs text-muted-foreground truncate max-w-xl">
                          {post.caption}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {post.scheduled_at ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(post.scheduled_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unscheduled</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </main>

      {/* Editor Modal */}
      {editingPost && (
        <PostEditor
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={handleSave}
          onDelete={handleDelete}
          onPublished={handleInstagramPublished}
        />
      )}

      {/* Fill Schedule Dialog */}
      {showFillSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-lg shadow-xl border w-full max-w-md m-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Fill Schedule</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowFillSchedule(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Auto-generate one post per day using random OG images. Each post gets a unique card.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Start date</label>
                  <input
                    type="date"
                    value={fillStart}
                    onChange={(e) => setFillStart(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">End date</label>
                  <input
                    type="date"
                    value={fillEnd}
                    onChange={(e) => setFillEnd(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Post time (ET)</label>
                <input
                  type="time"
                  value={fillTime}
                  onChange={(e) => setFillTime(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">Eastern Time — converted to UTC when scheduling</p>
              </div>
              {fillStart && fillEnd && (
                <p className="text-sm text-muted-foreground">
                  {Math.max(0, Math.ceil((new Date(fillEnd).getTime() - new Date(fillStart).getTime()) / 86400000) + 1)} posts will be scheduled
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowFillSchedule(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleFillSchedule}
                disabled={filling || !fillStart || !fillEnd}
                className="gap-1.5"
              >
                {filling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                {filling ? 'Scheduling...' : 'Schedule Posts'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
