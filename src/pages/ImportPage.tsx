import Import from './Import'

export default function ImportPage() {
  return (
    <>
      <div className="page" style={{ marginBottom: 0 }}>
        <div className="banner">
          <span>
            Only import customers you have a lawful basis and permission to contact. By importing, you confirm
            your shop has that permission for follow-up messages about their declined repairs.
          </span>
        </div>
      </div>
      <Import />
    </>
  )
}
