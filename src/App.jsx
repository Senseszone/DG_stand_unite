import { useState, useEffect } from 'react'
import './App.css'
import DiagnosticDashboard from './components/DiagnosticDashboard'
import StatusPanel from './components/StatusPanel'
import Header from './components/Header'

function App() {
  const [systemStatus, setSystemStatus] = useState('initializing')
  const [connectionStatus, setConnectionStatus] = useState(false)

  useEffect(() => {
    // Simulate system initialization
    const timer = setTimeout(() => {
      setSystemStatus('ready')
      setConnectionStatus(true)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="app">
      <Header 
        title="DG Stand Unite - Diagnostika" 
        status={systemStatus}
        connected={connectionStatus}
      />
      
      <main className="main-content">
        <StatusPanel />
        
        <DiagnosticDashboard 
          isReady={systemStatus === 'ready'}
        />
      </main>
    </div>
  )
}

export default App
