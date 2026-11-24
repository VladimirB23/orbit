import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { queryClient } from '@/api/queries';
import { ConfirmProvider } from '@/components/confirm';
import { router } from './router';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
