export type TransactionType = 'income' | 'expense' | 'transfer'
export type TransactionStatus = 'draft' | 'processed'
export type BankSource = 'rabobank' | 'wise' | 'revolut' | 'ocbc' | 'manual'
export type AccountType = 'account' | 'jar'

export interface Account {
  id: string
  user_id: string
  name: string
  bank: BankSource
  account_type: AccountType
  account_number?: string
  currency?: string
  linked_account_id?: string
  color: string
  icon?: string
  created_at: string
  updated_at: string
}

export interface AccountBalance {
  id: string
  account_id: string
  currency: string
  balance: number
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  date: string
  description: string
  original_description: string
  amount: number
  currency: string
  type: TransactionType
  category?: string
  subcategory?: string
  notes?: string
  vendor?: string
  ai_categorized: boolean
  status: TransactionStatus
  source: BankSource
  import_hash: string // dedup
  transfer_group_id?: string
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  parent?: string
  color: string
  icon?: string
  type: TransactionType
}

export interface CategoryRule {
  id: string
  user_id: string
  category: string
  keyword: string
  created_at: string
}

export interface AdminCategory {
  id: string
  user_id: string
  name: string
  type: 'expense' | 'income' | 'advance'
  created_at: string
}

export interface Vendor {
  id: string
  user_id: string
  name: string
  category: string
  created_at: string
}

export type Tool = {
  id: string
  name: string
  description: string
  href: string
  icon: string
  color: string
  external?: boolean
}
