import './SectionHeading.css'

type SectionHeadingProps = {
  id: string
  eyebrow: string
  title: string
}

export function SectionHeading({ id, eyebrow, title }: SectionHeadingProps): React.JSX.Element {
  return (
    <div className="section-heading">
      <p className="eyebrow section-heading__eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
    </div>
  )
}
