import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { queryClient } from './api/query-client.js';
import { publicRoutes } from './routes/public-routes.jsx';

const router = createBrowserRouter(publicRoutes);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
