import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { queryClient } from './api/query-client.js';
import { initializeAuth } from './features/auth/api.js';
import { homepageQuery } from './features/public-ui/home-query.js';
import { publicRoutes } from './routes/public-routes.jsx';

if (window.location.pathname === '/')
  void queryClient.prefetchQuery(homepageQuery);

const router = createBrowserRouter(publicRoutes);

export default function App() {
  useEffect(() => {
    void initializeAuth();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
