import React, { useState } from 'react'
import './DiagnosticDashboard.css'

const DiagnosticDashboard = ({ isReady }) => {
  const [activeTest, setActiveTest] = useState(null)
  const [testResults, setTestResults] = useState({})
  const [logs, setLogs] = useState([])

  const diagnosticCategories = [
    {
      id: 'electrical',
      name: 'Elektrické systémy',
      tests: [
        { id: 'voltage', name: 'Test napětí', description: 'Kontrola napájecích okruhů' },
        { id: 'current', name: 'Test proudu', description: 'Měření odběru proudu' },
        { id: 'resistance', name: 'Test odporu', description: 'Kontrola izolace' }
      ]
    },
    {
      id: 'mechanical',
      name: 'Mechanické systémy',
      tests: [
        { id: 'motors', name: 'Test motorů', description: 'Kontrola funkce motorů' },
        { id: 'sensors', name: 'Test senzorů', description: 'Kalibrace a funkčnost senzorů' },
        { id: 'actuators', name: 'Test aktuátorů', description: 'Kontrola pohyblivých částí' }
      ]
    },
    {
      id: 'communication',
      name: 'Komunikační systémy',
      tests: [
        { id: 'network', name: 'Test sítě', description: 'Kontrola síťového připojení' },
        { id: 'protocols', name: 'Test protokolů', description: 'Verifikace komunikačních protokolů' },
        { id: 'data', name: 'Test dat', description: 'Kontrola integrity dat' }
      ]
    }
  ]

  const runTest = async (categoryId, testId, testName) => {
    if (!isReady) return

    setActiveTest({ categoryId, testId })
    
    // Add log entry
    const logEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message: `Spouštím test: ${testName}`,
      type: 'info'
    }
    setLogs(prev => [logEntry, ...prev.slice(0, 19)]) // Keep last 20 logs

    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000))

    // Simulate test result
    const success = Math.random() > 0.2 // 80% success rate
    const result = {
      status: success ? 'passed' : 'failed',
      timestamp: new Date().toLocaleTimeString(),
      duration: `${(2 + Math.random() * 3).toFixed(2)}s`,
      details: success ? 'Test dokončen úspěšně' : 'Detekována chyba v systému'
    }

    setTestResults(prev => ({
      ...prev,
      [`${categoryId}-${testId}`]: result
    }))

    // Add result log
    const resultLog = {
      timestamp: new Date().toLocaleTimeString(),
      message: `Test ${testName} ${success ? 'úspěšný' : 'neúspěšný'}: ${result.details}`,
      type: success ? 'success' : 'error'
    }
    setLogs(prev => [resultLog, ...prev.slice(0, 19)])

    setActiveTest(null)
  }

  return (
    <div className="diagnostic-dashboard">
      <div className="dashboard-main">
        <div className="categories-section">
          <h2>Diagnostické kategorie</h2>
          <div className="categories-grid">
            {diagnosticCategories.map(category => (
              <div key={category.id} className="category-card">
                <h3 className="category-title">{category.name}</h3>
                <div className="tests-list">
                  {category.tests.map(test => {
                    const testKey = `${category.id}-${test.id}`
                    const result = testResults[testKey]
                    const isRunning = activeTest?.categoryId === category.id && activeTest?.testId === test.id
                    
                    return (
                      <div key={test.id} className="test-item">
                        <div className="test-info">
                          <div className="test-name">{test.name}</div>
                          <div className="test-description">{test.description}</div>
                        </div>
                        <div className="test-controls">
                          {result && (
                            <div className={`test-result ${result.status}`}>
                              {result.status === 'passed' ? '✓' : '✗'}
                              <span className="result-time">{result.duration}</span>
                            </div>
                          )}
                          <button
                            className={`test-button ${isRunning ? 'running' : ''}`}
                            onClick={() => runTest(category.id, test.id, test.name)}
                            disabled={!isReady || isRunning}
                          >
                            {isRunning ? 'Běží...' : 'Spustit'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="logs-section">
        <h3>Protokol diagnostiky</h3>
        <div className="logs-container">
          {logs.length === 0 ? (
            <div className="logs-empty">Žádné záznamy k zobrazení</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={`log-entry ${log.type}`}>
                <span className="log-timestamp">{log.timestamp}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default DiagnosticDashboard