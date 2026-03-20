'use client'

import Link from 'next/link'
import { Calculator, Target, Plus } from 'lucide-react'

const TOOLS = [
  {
    id: 'priority-os',
    name: 'Priority OS',
    description: 'Goals, initiatives, tasks & weekly planning',
    href: process.env.NEXT_PUBLIC_PRIORITY_OS_URL ?? '#',
    icon: Target,
    color: 'bg-indigo-500',
    external: true,
  },
  {
    id: 'administratie',
    name: 'Administratie',
    description: 'Bankrekeningen, transacties & overzichten',
    href: '/administratie',
    icon: Calculator,
    color: 'bg-emerald-500',
    external: false,
  },
]

export default function HubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Welkom terug</h1>
        <p className="text-sm text-slate-500 mt-1">Kies een tool om mee aan de slag te gaan.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOOLS.map(tool => {
          const Icon = tool.icon
          const cardClass = "group bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-4 hover:border-slate-300 hover:shadow-md transition-all cursor-pointer"
          const inner = (
            <>
              <div className={`w-12 h-12 rounded-xl ${tool.color} flex items-center justify-center`}>
                <Icon size={22} className="text-white" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{tool.name}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{tool.description}</p>
              </div>
            </>
          )
          return tool.external ? (
            <a key={tool.id} href={tool.href} target="_blank" rel="noopener noreferrer" className={cardClass}>{inner}</a>
          ) : (
            <Link key={tool.id} href={tool.href} className={cardClass}>{inner}</Link>
          )
        })}

        {/* Add tool placeholder */}
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 flex flex-col gap-4 items-center justify-center text-center opacity-50 cursor-not-allowed">
          <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center">
            <Plus size={22} className="text-slate-400" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-500">Tool toevoegen</h2>
            <p className="text-xs text-slate-400 mt-0.5">Binnenkort beschikbaar</p>
          </div>
        </div>
      </div>
    </div>
  )
}
