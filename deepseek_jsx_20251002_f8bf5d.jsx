// package.json
{
  "name": "people-link-social",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": {
    "react": "^18.2.0", "react-dom": "^18.2.0", 
    "react-router-dom": "^6.8.0", "lucide-react": "^0.263.1"
  }
}

// App.jsx
import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Header from './components/Header/Header'
import Hero from './components/Hero/Hero'
import Features from './components/Features/Features'
import AuthModal from './components/Auth/AuthModal'
import './App.css'

function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [user, setUser] = useState(null)

  return (
    <Router>
      <div className="app">
        <Header user={user} onAuthClick={() => setIsAuthModalOpen(true)} />
        <Routes>
          <Route path="/" element={<>
            <Hero onGetStarted={() => setIsAuthModalOpen(true)} />
            <Features />
          </>} />
        </Routes>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onLogin={setUser} />
      </div>
    </Router>
  )
}
export default App