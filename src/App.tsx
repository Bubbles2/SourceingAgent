import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'

function App(): React.JSX.Element {
  return <RouterProvider router={router} />
}

export default App
