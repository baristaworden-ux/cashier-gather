'use client'

const LINE = '________________________________'
const SHORT = '____________'
const CELL = '_________'

export default function CashierTemplatePage() {
  return (
    <>
      <style suppressHydrationWarning>{`
        @media print {
          body * { visibility: hidden; }
          #template, #template * { visibility: visible; }
          #template { position: absolute; left: 0; top: 0; }
          .no-print { display: none !important; }
        }
        @page { size: A5; margin: 10mm; }
        #template { font-family: 'Courier New', Courier, monospace; font-size: 10px; line-height: 1.8; color: #000; width: 128mm; }
      `}</style>

      <div className="no-print mb-6 flex items-center gap-4">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Print template
        </button>
        <a href="/cashier" className="text-sm text-slate-500 hover:text-slate-700">← Back to upload</a>
      </div>

      <div id="template">
        <pre style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', whiteSpace: 'pre', margin: 0 }}>{`GATHER CASHIER DAILY REPORT
${'─'.repeat(54)}
Date: ${SHORT}     Name: ${SHORT}
${'─'.repeat(54)}
OPENING
  Opening Cashier (Modal):  ${SHORT}
${'─'.repeat(54)}
CASH PER PAYMENT METHOD
  `}</pre>

        {/* Sales table in monospace */}
        <pre style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit', whiteSpace: 'pre', margin: 0 }}>{
`                  Cafe      Wild Muse   Tip       Total
  Cash            ${CELL}   ${CELL}   ${CELL}   ${CELL}
  EDC BCA         ${CELL}   ${CELL}   ${CELL}   ${CELL}
  EDC Mandiri     ${CELL}   ${CELL}   ${CELL}   ${CELL}
  QRIS BCA        ${CELL}   ${CELL}   ${CELL}   ${CELL}
  QRIS Mandiri    ${CELL}   ${CELL}   ${CELL}   ${CELL}
  Grab            ${CELL}
  Gojek           ${CELL}
  ${'─'.repeat(50)}
  Total Sales     ${CELL}   ${CELL}   ${CELL}   ${CELL}
${'─'.repeat(54)}
EXPENSES
  Description                  Amount     Paid by
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'_'.repeat(22)}   ${SHORT}   ${SHORT}
  ${'─'.repeat(50)}
  Total Expenses               ${SHORT}
${'─'.repeat(54)}
PETTY CASH CALCULATION
    Opening Petty Cash                 ${SHORT}
  + Petty Cash Received              + ${SHORT}
  + Money from Cash Sales            + ${SHORT}
  ${'─'.repeat(50)}
  Actual Petty Cash Counted          ${SHORT}
${'─'.repeat(54)}
NOTES
  ${LINE}
  ${LINE}`}
        </pre>
      </div>
    </>
  )
}
