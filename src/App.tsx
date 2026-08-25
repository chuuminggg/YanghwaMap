import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { DetailPage } from './pages/DetailPage'
import { DrivePage } from './pages/DrivePage'
import { EditPage } from './pages/EditPage'
import { ListPage } from './pages/ListPage'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { NewPage } from './pages/NewPage'
import { RestroomPage } from './pages/RestroomPage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <ListPage /> },
          { path: 'map', element: <MapPage /> },
          { path: 'restroom', element: <RestroomPage /> },
          { path: 'drive', element: <DrivePage /> },
          { path: 'new', element: <NewPage /> },
          { path: ':id', element: <DetailPage /> },
          { path: ':id/edit', element: <EditPage /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
