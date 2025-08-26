import React from 'react'
import './Header.css'

const Header = ({ title, status, connected }) => {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="header-title">{title}</h1>
        <div className="header-status">
          <div className={`status-indicator ${status}`}>
            <span className="status-dot"></span>
            <span className="status-text">
              Systém: {status === 'ready' ? 'Připraven' : 'Inicializace...'}
            </span>
          </div>
          <div className={`connection-indicator ${connected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span className="status-text">
              Připojení: {connected ? 'Aktivní' : 'Odpojeno'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header