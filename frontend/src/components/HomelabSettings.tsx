'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { load } from '@tauri-apps/plugin-store'
import { Server, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react'

type ConnectionStatus =
  | { type: 'idle' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }

export function HomelabSettings() {
  const [serverAddress, setServerAddress] = useState('')
  const [apiSecretKey, setApiSecretKey] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ type: 'idle' })

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const store = await load('store.json')
        const savedServerAddress = await store.get<string>('serverAddress')
        const savedApiSecretKey = await store.get<string>('apiSecretKey')

        setServerAddress(savedServerAddress ?? '')
        setApiSecretKey(savedApiSecretKey ?? '')
      } catch (error) {
        console.error('Failed to load homelab settings:', error)
      }
    }

    loadSettings()
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    setConnectionStatus({ type: 'idle' })

    try {
      const store = await load('store.json')
      await store.set('serverAddress', serverAddress)
      await store.set('apiSecretKey', apiSecretKey)
      await store.save()

      setShowSaved(true)
      setTimeout(() => setShowSaved(false), 2000)
    } catch (error) {
      console.error('Failed to save homelab settings:', error)
      setConnectionStatus({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setConnectionStatus({ type: 'idle' })

    try {
      await invoke('api_test_connection')
      setConnectionStatus({ type: 'success', message: 'Connected' })
    } catch (error) {
      setConnectionStatus({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Server className="w-5 h-5 text-gray-900" />
          <h3 className="text-lg font-semibold text-gray-900">Homelab Connection</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Configure your homelab backend URL and API secret key.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Server URL</label>
            <input
              type="text"
              placeholder="https://meetily.yourdomain.com"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Secret Key</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={apiSecretKey}
                onChange={(e) => setApiSecretKey(e.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowSecret((prev) => !prev)}
                className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                aria-label={showSecret ? 'Hide API secret key' : 'Show API secret key'}
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-4 py-2 border border-gray-300 text-sm rounded-md hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>

          {showSaved && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Saved
            </div>
          )}

          {connectionStatus.type === 'success' && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              {connectionStatus.message}
            </div>
          )}

          {connectionStatus.type === 'error' && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <XCircle className="w-4 h-4" />
              Failed: {connectionStatus.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
