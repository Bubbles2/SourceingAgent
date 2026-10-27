/** Shown in the page slot while a route's loader runs on the very first load. */
export function PageLoading(): React.JSX.Element {
  return (
    <div className="section">
      <div className="container">
        <p role="status" className="visually-hidden">
          Loading page
        </p>
      </div>
    </div>
  )
}
