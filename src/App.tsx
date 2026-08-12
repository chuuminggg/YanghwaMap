import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { ListPage } from './pages/ListPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [{ index: true, element: <ListPage /> }],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
