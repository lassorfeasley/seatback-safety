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
} from 'lucide-react';
import {
  fetchSocialPosts,
  generateSocialPost,
  updateSocialPost,
  deleteSocialPost,
  renderCropPreview,
  type SocialPostWithCard,
  type SocialPost,
} from '@/lib/socialService';
import { useNavigate } from 'react-router-dom';

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
    if (!post.panel_image_url) return;

    renderCropPreview(
      post.panel_image_url,
      post.crop_x_pct,
      post.crop_y_pct,
      post.crop_size_pct,
      size * 2
    )
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
  }, [post.panel_image_url, post.crop_x_pct, post.crop_y_pct, post.crop_size_pct, size]);

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
}: {
  post: SocialPostWithCard;
  onClose: () => void;
  onSave: (id: string, updates: Partial<Pick<SocialPost, 'caption' | 'status' | 'scheduled_at'>>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [caption, setCaption] = useState(post.caption ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    post.scheduled_at ? post.scheduled_at.slice(0, 16) : ''
  );
  const [status, setStatus] = useState(post.status);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SocialPost['status'])}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scheduled Date</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 border-t">
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
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
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
  const [posts, setPosts] = useState<SocialPostWithCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<SocialPostWithCard | null>(null);

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const loadPosts = useCallback(async () => {
    const { posts: data, error: err } = await fetchSocialPosts();
    if (err) {
      setError(err);
    } else {
      setPosts(data ?? []);
    }
    setLoading(false);
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
      <header className="flex-shrink-0 bg-card border-b">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-5">
          <h1 className="text-2xl font-semibold tracking-tight">Social Calendar</h1>
          <Button
            onClick={handleGenerate}
            size="sm"
            className="gap-1.5"
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generating ? 'Generating...' : 'Generate Post'}
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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
        </div>
      </main>

      {/* Editor Modal */}
      {editingPost && (
        <PostEditor
          post={editingPost}
          onClose={() => setEditingPost(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </>
  );
};
