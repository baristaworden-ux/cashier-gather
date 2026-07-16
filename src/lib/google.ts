async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!
  const rawKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '')
    .replace(/\\n/g, '\n')
    .replace(/^["']|["']$/g, '')
    .trim()

  // Strip PEM headers and decode base64 — works with PKCS8 keys on OpenSSL 3
  const pemBody = rawKey
    .replace(/-----BEGIN[^-]+-----/, '')
    .replace(/-----END[^-]+-----/, '')
    .replace(/\s+/g, '')
  const keyBytes = Uint8Array.from(Buffer.from(pemBody, 'base64'))
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url')

  const signingInput = `${header}.${payload}`
  const sigBytes = await globalThis.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    Buffer.from(signingInput)
  )
  const signature = Buffer.from(sigBytes).toString('base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  })

  const data = await res.json() as { access_token: string; error?: string }
  if (data.error) throw new Error(`Google auth error: ${data.error}`)
  return data.access_token
}

export async function appendToSheet(values: (string | number | null)[]): Promise<void> {
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!
  const tab = process.env.GOOGLE_SHEETS_TAB ?? 'Sheet1'

  // Count rows in column A to find exact next empty row (bypasses :append scan issues)
  const countRange = encodeURIComponent(`${tab}!A:A`)
  const countRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${countRange}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const countData = await countRes.json() as { values?: string[][] }
  const nextRow = (countData.values?.length ?? 0) + 1

  const writeRange = encodeURIComponent(`${tab}!A${nextRow}`)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [values] }),
    },
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Sheets API error: ${JSON.stringify(err)}`)
  }
}

export async function logFeedback(date: string, diffs: { field: string; ai: string; corrected: string }[]): Promise<void> {
  if (!diffs.length) return
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!

  // Count existing rows to find next empty row (same pattern as appendToSheet)
  const countRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Feedback!A:A')}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const countData = await countRes.json() as { values?: string[][] }
  const nextRow = (countData.values?.length ?? 0) + 1

  const writeRange = encodeURIComponent(`Feedback!A${nextRow}`)
  const rows = diffs.map(d => [date, d.field, d.ai, d.corrected])

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    },
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Feedback write error: ${JSON.stringify(err)}`)
  }
}

export async function getRecentFeedback(): Promise<{ field: string; ai: string; corrected: string }[]> {
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!
  const range = encodeURIComponent('Feedback!A:D')
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return []
  const data = await res.json() as { values?: string[][] }
  const rows = (data.values ?? []).slice(1) // skip header
  // Return last 15 corrections, newest first
  return rows.slice(-15).reverse().map(r => ({ field: r[1] ?? '', ai: r[2] ?? '', corrected: r[3] ?? '' }))
}

export async function getSupplierList(): Promise<string[]> {
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!
  const tab = encodeURIComponent('Lists')

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}!A:A`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return []
  const data = await res.json() as { values?: string[][] }
  return (data.values ?? []).slice(1).map(r => r[0]).filter(Boolean)
}

export async function getCashierList(): Promise<string[]> {
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!
  const tab = encodeURIComponent('Lists')

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}!Q:Q`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return []
  const data = await res.json() as { values?: string[][] }
  return (data.values ?? []).slice(1).map(r => r[0]).filter(Boolean)
}

export async function getSheetRows(): Promise<{ rowIndex: number; values: string[] }[]> {
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!
  const tab = encodeURIComponent(process.env.GOOGLE_SHEETS_TAB ?? 'Sheet1')

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}!A:AL`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Sheets read error: ${JSON.stringify(err)}`)
  }
  const data = await res.json() as { values?: string[][] }
  const rows = data.values ?? []
  // Skip header row (index 0), skip empty rows (no date in column A)
  return rows.slice(1)
    .map((values, i) => ({ rowIndex: i + 1, values }))
    .filter(row => row.values[0]?.trim())
}

export async function deleteSheetRow(rowIndex: number): Promise<void> {
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!
  const tabName = process.env.GOOGLE_SHEETS_TAB ?? 'Sheet1'

  // Resolve the sheet's numeric GID
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const meta = await metaRes.json() as { sheets: { properties: { title: string; sheetId: number } }[] }
  const sheet = meta.sheets?.find(s => s.properties.title === tabName)
  const sheetId = sheet?.properties?.sheetId ?? 0

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
          },
        }],
      }),
    },
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Delete row error: ${JSON.stringify(err)}`)
  }
}

export async function migrateColumns(): Promise<{ message: string; rowsUpdated: number }> {
  const token = await getAccessToken()
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID!
  const tabName = process.env.GOOGLE_SHEETS_TAB ?? 'Sheet1'

  // Resolve numeric sheetId
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const meta = await metaRes.json() as { sheets: { properties: { title: string; sheetId: number } }[] }
  const sheet = meta.sheets?.find(s => s.properties.title === tabName)
  if (!sheet) throw new Error(`Sheet "${tabName}" not found`)
  const sheetId = sheet.properties.sheetId

  // Insert 5 new columns right-to-left so earlier indices aren't shifted by later insertions.
  // Original positions (0-based): Cash-Tip=7, EDC BCA-Tip=10, EDC Mandiri-Tip=13, QRIS BCA-Tip=16, QRIS Mandiri-Tip=19
  // Insert AFTER each tip column → startIndex = tipIndex + 1
  const insertRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 20, endIndex: 21 }, inheritFromBefore: false } }, // QRIS Mandiri-Total (after T)
          { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 17, endIndex: 18 }, inheritFromBefore: false } }, // QRIS BCA-Total (after Q)
          { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, inheritFromBefore: false } }, // EDC Mandiri-Total (after N)
          { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 11, endIndex: 12 }, inheritFromBefore: false } }, // EDC BCA-Total (after K)
          { insertDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8,  endIndex: 9  }, inheritFromBefore: false } }, // Cash-Total (after H)
        ],
      }),
    },
  )
  if (!insertRes.ok) {
    const err = await insertRes.json()
    throw new Error(`Column insert error: ${JSON.stringify(err)}`)
  }

  // Write headers for the 5 new columns (now at I, M, Q, U, Y after all insertions)
  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `${tabName}!I1`, values: [['Cash-Total']] },
          { range: `${tabName}!M1`, values: [['EDC BCA-Total']] },
          { range: `${tabName}!Q1`, values: [['EDC Mandiri-Total']] },
          { range: `${tabName}!U1`, values: [['QRIS BCA-Total']] },
          { range: `${tabName}!Y1`, values: [['QRIS Mandiri-Total']] },
        ],
      }),
    },
  )
  if (!headerRes.ok) {
    const err = await headerRes.json()
    throw new Error(`Header write error: ${JSON.stringify(err)}`)
  }

  // Count existing data rows and backfill SUM formulas so old rows show totals too
  const countRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`${tabName}!A:A`)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const countData = await countRes.json() as { values?: string[][] }
  const dataRowCount = Math.max((countData.values?.length ?? 1) - 1, 0)

  if (dataRowCount > 0) {
    const lastRow = dataRowCount + 1
    // After column insertions, the new totals correspond to:
    //   I = F+G+H   (Cash)
    //   M = J+K+L   (EDC BCA)
    //   Q = N+O+P   (EDC Mandiri)
    //   U = R+S+T   (QRIS BCA)
    //   Y = V+W+X   (QRIS Mandiri)
    const cols: { col: string; formula: (row: number) => string }[] = [
      { col: 'I', formula: r => `=F${r}+G${r}+H${r}` },
      { col: 'M', formula: r => `=J${r}+K${r}+L${r}` },
      { col: 'Q', formula: r => `=N${r}+O${r}+P${r}` },
      { col: 'U', formula: r => `=R${r}+S${r}+T${r}` },
      { col: 'Y', formula: r => `=V${r}+W${r}+X${r}` },
    ]
    const batchData = cols.map(({ col, formula }) => ({
      range: `${tabName}!${col}2:${col}${lastRow}`,
      values: Array.from({ length: dataRowCount }, (_, i) => [formula(i + 2)]),
    }))

    const formulaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: batchData }),
      },
    )
    if (!formulaRes.ok) {
      const err = await formulaRes.json()
      throw new Error(`Formula backfill error: ${JSON.stringify(err)}`)
    }
  }

  return { message: 'Migration complete', rowsUpdated: dataRowCount }
}

export async function uploadImageToDrive(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  const token = await getAccessToken()
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  const metadata = JSON.stringify({
    name: filename,
    ...(folderId ? { parents: [folderId] } : {}),
  })

  const boundary = 'cashier_upload_boundary'
  const metaPart = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    '',
  ].join('\r\n')
  const mediaPart = [`--${boundary}`, `Content-Type: ${mimeType}`, '', ''].join('\r\n')
  const closing = `\r\n--${boundary}--`

  const body = Buffer.concat([
    Buffer.from(metaPart),
    Buffer.from(mediaPart),
    buffer,
    Buffer.from(closing),
  ])

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body,
    },
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Drive API error: ${JSON.stringify(err)}`)
  }

  const data = await res.json() as { id: string; webViewLink?: string }
  return data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`
}
