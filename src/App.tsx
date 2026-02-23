import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/authContext';

import { AdminLayout } from './components/Admin/AdminLayout';
import { AdminLibrary } from './components/Admin/AdminLibrary';
import { AdminCardDetail } from './components/Admin/AdminCardDetail';
import { AdminCropEditor } from './components/Admin/AdminCropEditor';
import { AdminFoldEditor } from './components/Admin/AdminFoldEditor';
import { AdminAirlines } from './components/Admin/AdminAirlines';
import { AdminManufacturers } from './components/Admin/AdminManufacturers';
import { LoginPage } from './components/Auth/LoginPage';
import { RequireAuth } from './components/Auth/RequireAuth';

import { PublicLayout } from './components/Public/PublicLayout';
import { PublicHome } from './components/Public/PublicHome';
import { PublicAirlinesBrowse } from './components/Public/PublicAirlinesBrowse';
import { PublicAirlineDetail } from './components/Public/PublicAirlineDetail';
import { PublicManufacturersBrowse } from './components/Public/PublicManufacturersBrowse';
import { PublicManufacturerDetail } from './components/Public/PublicManufacturerDetail';
import { PublicCardDetail } from './components/Public/PublicCardDetail';
import { AboutPage } from './components/Public/AboutPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route element={<PublicLayout />}>
          <Route index element={<PublicHome />} />
          <Route path="airlines" element={<PublicAirlinesBrowse />} />
          <Route path="airlines/:id" element={<PublicAirlineDetail />} />
          <Route path="manufacturers" element={<PublicManufacturersBrowse />} />
          <Route path="manufacturers/:id" element={<PublicManufacturerDetail />} />
          <Route path="cards/:id" element={<PublicCardDetail />} />
          <Route path="about" element={<AboutPage />} />
        </Route>

        {/* Auth */}
        <Route path="admin/login" element={<LoginPage />} />

        {/* Admin routes (auth required) */}
        <Route path="admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<AdminLibrary />} />
          <Route path="cards/:id" element={<AdminCardDetail />} />
          <Route path="cards/:id/crop" element={<AdminCropEditor />} />
          <Route path="cards/:id/folds" element={<AdminFoldEditor />} />
          <Route path="airlines" element={<AdminAirlines />} />
          <Route path="manufacturers" element={<AdminManufacturers />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
