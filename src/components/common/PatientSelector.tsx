import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, User } from 'lucide-react'
import { usePersonaStore } from '@/stores/personaStore'
import { getAllPersonas } from '@/data/personas'

interface PatientSelectorProps {
  onPatientChange?: (patientId: string) => void
  className?: string
}

export function PatientSelector({ onPatientChange, className = '' }: PatientSelectorProps) {
  const personas = getAllPersonas()
  const activePersonaId = usePersonaStore(state => state.activePersonaId)
  const setActivePersona = usePersonaStore(state => state.setActivePersona)
  const [isOpen, setIsOpen] = useState(false)

  const selectedPatient = personas.find(p => p.id === activePersonaId) || personas[0]

  const handleSelect = (patientId: string) => {
    setActivePersona(patientId)
    setIsOpen(false)
    onPatientChange?.(patientId)
  }

  const dropdownClasses = isOpen ? 'rotate-180' : ''
  const getRowClass = (id: string) => id === activePersonaId ? 'bg-primary-50' : ''

  return (
    <div className={'relative ' + className}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-primary-300 hover:shadow-md transition-all min-w-[200px]"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center">
          <User className="w-4 h-4 text-primary-600" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs text-gray-500">Patient</p>
          <p className="font-medium text-gray-900 text-sm">{selectedPatient?.name || 'Select'}</p>
        </div>
        <ChevronDown className={'w-4 h-4 text-gray-400 transition-transform ' + dropdownClasses} />
      </button>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden"
        >
          {personas.map((patient) => (
            <button
              key={patient.id}
              onClick={() => handleSelect(patient.id)}
              className={'w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left ' + getRowClass(patient.id)}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                <User className="w-3 h-3 text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 text-sm">{patient.name}</p>
                <p className="text-xs text-gray-500">{patient.daysOfData} days</p>
              </div>
              {patient.id === activePersonaId && (
                <div className="w-2 h-2 rounded-full bg-primary-500" />
              )}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default PatientSelector
