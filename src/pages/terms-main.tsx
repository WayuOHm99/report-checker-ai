import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import TermsOfService from './TermsOfService.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TermsOfService />
  </StrictMode>,
)
