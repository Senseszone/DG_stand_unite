import React from 'react'
import './StatusPanel.css'

const StatusPanel = () => {
  const systemMetrics = [
    { label: 'CPU Využití', value: '23%', status: 'good' },
    { label: 'Paměť', value: '1.2GB / 4GB', status: 'good' },
    { label: 'Teplota', value: '42°C', status: 'good' },
    { label: 'Napětí', value: '12.3V', status: 'warning' }
  ]

  const diagnosticTests = [
    { name: 'Test komunikace', status: 'passed', time: '0.12s' },
    { name: 'Test senzorů', status: 'passed', time: '0.34s' },
    { name: 'Test aktuátorů', status: 'running', time: '---' },
    { name: 'Test bezpečnosti', status: 'pending', time: '---' }
  ]

  return (
    <div className="status-panel">
      <div className="metrics-section">
        <h3>Systémové metriky</h3>
        <div className="metrics-grid">
          {systemMetrics.map((metric, index) => (
            <div key={index} className={`metric-card ${metric.status}`}>
              <div className="metric-label">{metric.label}</div>
              <div className="metric-value">{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="tests-section">
        <h3>Diagnostické testy</h3>
        <div className="tests-list">
          {diagnosticTests.map((test, index) => (
            <div key={index} className={`test-item ${test.status}`}>
              <div className="test-name">{test.name}</div>
              <div className="test-status">
                <span className={`status-badge ${test.status}`}>
                  {test.status === 'passed' && '✓ Úspěch'}
                  {test.status === 'running' && '⟳ Běží'}
                  {test.status === 'pending' && '⏳ Čeká'}
                  {test.status === 'failed' && '✗ Chyba'}
                </span>
                <span className="test-time">{test.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default StatusPanel