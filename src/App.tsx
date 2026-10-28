import { RouterProvider } from 'react-router/dom'
import { reportRouteError } from './app/errorReporting'
import { router } from './app/router'

function App(): React.JSX.Element {
  return <RouterProvider router={router} onError={reportRouteError} />
}

export default App
