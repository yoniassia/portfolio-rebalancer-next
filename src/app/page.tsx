export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        background: '#0D0D0D',
        color: '#FFFFFF',
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16 }}>🛠️</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
        Rebalancer recovery mode
      </h1>
      <p style={{ fontSize: 15, maxWidth: 560, lineHeight: 1.6, color: '#9CA3AF' }}>
        The frontend is temporarily running in a zero-JavaScript safe mode while we isolate the
        client-side crash. If you can see this page, the domain, proxy, and server rendering path
        are healthy.
      </p>
    </main>
  );
}
