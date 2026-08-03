import { createBrowserRouter } from 'react-router';
import { App } from './App.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { TopicsPage } from './pages/TopicsPage.js';
import { TopicDetailPage } from './pages/TopicDetailPage.js';
import { KeywordsPage } from './pages/KeywordsPage.js';
import { SourcesPage } from './pages/SourcesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: DashboardPage },
      { path: 'topics', Component: TopicsPage },
      { path: 'topics/:id', Component: TopicDetailPage },
      { path: 'keywords', Component: KeywordsPage },
      { path: 'sources', Component: SourcesPage },
      { path: 'settings', Component: SettingsPage },
    ],
  },
]);
