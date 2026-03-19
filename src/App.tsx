import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/authContext';

import { AdminLayout } from './components/Admin/AdminLayout';
import { AdminLibrary } from './components/Admin/AdminLibrary';
import { AdminCardDetail } from './components/Admin/AdminCardDetail';
import { AdminCropEditor } from './components/Admin/AdminCropEditor';
import { AdminFoldEditor } from './components/Admin/AdminFoldEditor';
import { AdminAirlines } from './components/Admin/AdminAirlines';
import { AdminAirlineDetail } from './components/Admin/AdminAirlineDetail';
import { AdminManufacturers } from './components/Admin/AdminManufacturers';
import { AdminManufacturerDetail } from './components/Admin/AdminManufacturerDetail';
import { AdminSocial } from './components/Admin/AdminSocial';
import { PrintLabel } from './components/Admin/PrintLabel';
import { LoginPage } from './components/Auth/LoginPage';
import { RequireAuth } from './components/Auth/RequireAuth';

import { PublicLayout } from './components/Public/PublicLayout';
import { PublicHome } from './components/Public/PublicHome';
import { PublicHomeLegacy } from './components/Public/PublicHomeLegacy';
import { PublicHomeArchive } from './components/Public/PublicHomeArchive';
import { PublicAirlinesBrowse } from './components/Public/PublicAirlinesBrowse';
import { PublicCountriesBrowse } from './components/Public/PublicCountriesBrowse';
import { PublicAirlineDetail } from './components/Public/PublicAirlineDetail';
import { PublicManufacturersBrowse } from './components/Public/PublicManufacturersBrowse';
import { PublicManufacturerDetail } from './components/Public/PublicManufacturerDetail';
import { PublicCardDetail } from './components/Public/PublicCardDetail';
import { PublicDecadesBrowse, PublicDecadeDetail } from './components/Public/PublicDecades';
import { PublicSearch } from './components/Public/PublicSearch';
import { AboutPage } from './components/Public/AboutPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Home – no layout chrome */}
        <Route index element={<PublicHome />} />
        <Route path="cards/:id" element={<PublicCardDetail />} />

        {/* Public routes */}
        <Route element={<PublicLayout />}>
          <Route path="airlines" element={<PublicAirlinesBrowse />} />
          <Route path="airlines/:id" element={<PublicAirlineDetail />} />
          <Route path="countries" element={<PublicCountriesBrowse />} />
          <Route path="manufacturers" element={<PublicManufacturersBrowse />} />
          <Route path="manufacturers/:id" element={<PublicManufacturerDetail />} />
          <Route path="decades" element={<PublicDecadesBrowse />} />
          <Route path="decades/:decade" element={<PublicDecadeDetail />} />
          <Route path="search" element={<PublicSearch />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="legacy" element={<PublicHomeLegacy />} />
          <Route path="archive" element={<PublicHomeArchive />} />
        </Route>

        {/* Auth */}
        <Route path="admin/login" element={<LoginPage />} />

        {/* Standalone admin pages (no layout chrome) */}
        <Route path="admin/cards/:id/label" element={<RequireAuth><PrintLabel /></RequireAuth>} />
        <Route path="admin/cards/:id/crop" element={<RequireAuth><AdminCropEditor /></RequireAuth>} />

        {/* Admin routes (auth required) */}
        <Route path="admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<AdminLibrary />} />
          <Route path="cards/:id" element={<AdminCardDetail />} />
          <Route path="cards/:id/folds" element={<AdminFoldEditor />} />
          <Route path="airlines" element={<AdminAirlines />} />
          <Route path="airlines/:id" element={<AdminAirlineDetail />} />
          <Route path="manufacturers" element={<AdminManufacturers />} />
          <Route path="manufacturers/:id" element={<AdminManufacturerDetail />} />
          <Route path="social" element={<AdminSocial />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
