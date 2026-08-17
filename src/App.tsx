import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { DetailPage } from './pages/DetailPage'
import { EditPage } from './pages/EditPage'
import { ListPage } from './pages/ListPage'
import { MapPage } from './pages/MapPage'
import { NewPage } from './pages/NewPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <ListPage /> },
      { path: 'map', element: <MapPage /> },
      { path: 'new', element: <NewPage /> },
      { path: ':id', element: <DetailPage /> },
      { path: ':id/edit', element: <EditPage /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
