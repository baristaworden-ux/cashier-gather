'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Lang = 'en' | 'id'

const translations = {
  en: {
    // Sidebar
    nav_daily_report: 'Daily Report',
    nav_records: 'Records',
    nav_template: 'Notebook Template',
    nav_soon: 'Soon',
    // Home
    home_subtitle: 'Admin — choose a module to get started',
    home_add_report: 'Add Daily Report',
    home_add_report_sub: 'Upload and save cashier report',
    home_add_expenses: 'Add Expenses',
    home_coming_soon: 'Coming soon',
    // Upload
    upload_title: 'Gather Cashier Daily Report',
    upload_subtitle: 'Upload a photo of the completed notebook form.',
    upload_page1: 'Page 1',
    upload_page2: 'Page 2',
    upload_page2_hint: 'optional — if form spans two pages',
    upload_drag: 'Drag a photo here',
    upload_drag_sub: 'or click to browse · JPG, PNG',
    upload_click_replace: 'Click to replace',
    upload_add_page2: 'Add page 2',
    upload_remove_page2: 'Remove page 2',
    upload_analyse: 'Analyse with AI',
    upload_template: 'Print notebook template',
    // Processing
    processing_title: 'AI is analysing the form…',
    processing_sub: 'This takes a few seconds',
    // Review
    review_title: 'Review & correct',
    review_subtitle: 'Adjust any values if needed, then save.',
    review_date: 'Date',
    review_name: 'Name',
    review_cashier_placeholder: 'Select cashier…',
    review_opening: 'Opening',
    review_opening_petty: 'Opening Petty Cash',
    review_petty_received: 'Petty Cash Received',
    review_modal: 'Opening Cashier (Modal)',
    review_sales: 'Sales per Payment Method',
    review_cafe: 'Cafe',
    review_wildmuse: 'Wild Muse',
    review_tip: 'Tip',
    review_total: 'Total',
    review_total_earnings: 'Total Earnings',
    review_expenses: 'Expenses',
    review_supplier: 'Supplier',
    review_amount: 'Amount',
    review_payment: 'Payment method',
    review_add_expense: 'Add expense',
    review_total_all: 'Total All Expenses',
    review_total_bca: 'Total BCA / Bank Transfer',
    review_total_petty: 'Total Petty Cash Expenses',
    review_petty_calc_hint: 'used in calculation below',
    review_petty_calc: 'Petty Cash Calculation',
    review_money_cash_sales: 'Money used from cash sales',
    review_money_cash_sales_hint: 'in case there is no petty cash',
    review_total_exp_petty: 'Total Expenses (Petty Cash)',
    review_expected: 'Expected Petty Cash Remaining',
    review_actual: 'Actual Petty Cash Counted',
    review_balanced: 'Difference (balanced ✓)',
    review_difference: 'Difference',
    review_notes: 'Notes',
    review_notes_placeholder: 'Any remarks…',
    review_overview: 'Final Cash Overview',
    review_cash_sales: 'Total Cash Sales',
    review_total_petty_cash: 'Total Petty Cash',
    review_modal_cash: 'Modal Cash',
    review_balanced_short: 'Balanced ✓',
    review_save: 'Save to Google Sheets',
    review_start_over: 'Start over',
    // Success
    success_title: 'Saved successfully!',
    success_sub: 'The daily report has been added to Google Sheets.',
    success_drive: 'View photo in Google Drive',
    success_new: 'New daily report',
    // Records
    records_title: 'Daily Report Records',
    records_sub: 'All submitted reports.',
    records_refresh: 'Refresh',
    records_empty: 'No records yet.',
    records_date: 'Date',
    records_cashier: 'Cashier',
    records_notes: 'Notes',
    records_delete_title: 'Delete this record?',
    records_delete_sub: 'This removes the row from Google Sheets. Resubmit the form to add it back.',
    records_delete_confirm: 'Delete',
    records_cancel: 'Cancel',
  },
  id: {
    // Sidebar
    nav_daily_report: 'Laporan Harian',
    nav_records: 'Catatan',
    nav_template: 'Template Buku',
    nav_soon: 'Segera',
    // Home
    home_subtitle: 'Admin — pilih modul untuk memulai',
    home_add_report: 'Tambah Laporan Harian',
    home_add_report_sub: 'Unggah dan simpan laporan kasir',
    home_add_expenses: 'Tambah Pengeluaran',
    home_coming_soon: 'Segera hadir',
    // Upload
    upload_title: 'Laporan Harian Kasir Gather',
    upload_subtitle: 'Unggah foto formulir buku catatan yang telah diisi.',
    upload_page1: 'Halaman 1',
    upload_page2: 'Halaman 2',
    upload_page2_hint: 'opsional — jika formulir mencakup dua halaman',
    upload_drag: 'Seret foto ke sini',
    upload_drag_sub: 'atau klik untuk mencari · JPG, PNG',
    upload_click_replace: 'Klik untuk mengganti',
    upload_add_page2: 'Tambah halaman 2',
    upload_remove_page2: 'Hapus halaman 2',
    upload_analyse: 'Analisis dengan AI',
    upload_template: 'Cetak template buku',
    // Processing
    processing_title: 'AI sedang menganalisis formulir…',
    processing_sub: 'Ini membutuhkan beberapa detik',
    // Review
    review_title: 'Periksa & koreksi',
    review_subtitle: 'Sesuaikan nilai jika perlu, lalu simpan.',
    review_date: 'Tanggal',
    review_name: 'Nama',
    review_cashier_placeholder: 'Pilih kasir…',
    review_opening: 'Pembukaan',
    review_opening_petty: 'Kas Kecil Awal',
    review_petty_received: 'Kas Kecil Diterima',
    review_modal: 'Modal Awal Kasir',
    review_sales: 'Penjualan per Metode Pembayaran',
    review_cafe: 'Kafe',
    review_wildmuse: 'Wild Muse',
    review_tip: 'Tip',
    review_total: 'Total',
    review_total_earnings: 'Total Pendapatan',
    review_expenses: 'Pengeluaran',
    review_supplier: 'Pemasok',
    review_amount: 'Jumlah',
    review_payment: 'Metode pembayaran',
    review_add_expense: 'Tambah pengeluaran',
    review_total_all: 'Total Semua Pengeluaran',
    review_total_bca: 'Total BCA / Transfer Bank',
    review_total_petty: 'Total Pengeluaran Kas Kecil',
    review_petty_calc_hint: 'digunakan dalam perhitungan di bawah',
    review_petty_calc: 'Perhitungan Kas Kecil',
    review_money_cash_sales: 'Uang dari penjualan tunai',
    review_money_cash_sales_hint: 'jika tidak ada kas kecil',
    review_total_exp_petty: 'Total Pengeluaran (Kas Kecil)',
    review_expected: 'Sisa Kas Kecil yang Diharapkan',
    review_actual: 'Kas Kecil yang Dihitung',
    review_balanced: 'Selisih (seimbang ✓)',
    review_difference: 'Selisih',
    review_notes: 'Catatan',
    review_notes_placeholder: 'Catatan tambahan…',
    review_overview: 'Ringkasan Kas Akhir',
    review_cash_sales: 'Total Penjualan Tunai',
    review_total_petty_cash: 'Total Kas Kecil',
    review_modal_cash: 'Modal Kas',
    review_balanced_short: 'Seimbang ✓',
    review_save: 'Simpan ke Google Sheets',
    review_start_over: 'Mulai ulang',
    // Success
    success_title: 'Berhasil disimpan!',
    success_sub: 'Laporan harian telah ditambahkan ke Google Sheets.',
    success_drive: 'Lihat foto di Google Drive',
    success_new: 'Laporan harian baru',
    // Records
    records_title: 'Catatan Laporan Harian',
    records_sub: 'Semua laporan yang telah dikirim.',
    records_refresh: 'Perbarui',
    records_empty: 'Belum ada catatan.',
    records_date: 'Tanggal',
    records_cashier: 'Kasir',
    records_notes: 'Catatan',
    records_delete_title: 'Hapus catatan ini?',
    records_delete_sub: 'Ini menghapus baris dari Google Sheets. Kirim ulang formulir untuk menambahkannya kembali.',
    records_delete_confirm: 'Hapus',
    records_cancel: 'Batal',
  },
} as const

type TranslationKey = keyof typeof translations.en

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    const stored = localStorage.getItem('gather_lang') as Lang | null
    if (stored === 'en' || stored === 'id') setLangState(stored)
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('gather_lang', l)
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useT() {
  const { lang } = useContext(LangContext)
  return (key: TranslationKey) => translations[lang][key]
}

export function useLang() {
  return useContext(LangContext)
}
