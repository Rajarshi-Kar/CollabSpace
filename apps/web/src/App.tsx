import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { WorkspaceLayout } from './components/layout/WorkspaceLayout';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { OrgsPage } from './pages/OrgsPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { OverviewPage } from './pages/OverviewPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentEditorPage } from './pages/DocumentEditorPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectBoardPage } from './pages/ProjectBoardPage';
import { ChannelsPage } from './pages/ChannelsPage';
import { ChannelPage } from './pages/ChannelPage';
import { FilesPage } from './pages/FilesPage';
import { SearchPage } from './pages/SearchPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/orgs" element={<OrgsPage />} />
        <Route path="/o/:orgId" element={<WorkspacesPage />} />

        <Route path="/o/:orgId/w/:workspaceId" element={<WorkspaceLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="documents/:documentId" element={<DocumentEditorPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectBoardPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route path="channels/:channelId" element={<ChannelPage />} />
          <Route path="files" element={<FilesPage />} />
          <Route path="search" element={<SearchPage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/orgs" replace />} />
      <Route path="*" element={<Navigate to="/orgs" replace />} />
    </Routes>
  );
}

export default App;
