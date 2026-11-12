import { supabase } from '../../lib/supabase'

export type InquiryStatus = 'new' | 'read' | 'replied' | 'archived'

export interface Inquiry {
  id: string
  name: string
  contact: string
  message: string
  branch_interest: string | null
  status: InquiryStatus
  replied_by: string | null
  replied_at: string | null
  reply_notes: string | null
  created_at: string
}

/** Public: submit inquiry (anon or authenticated) */
export async function submitInquiry(input: {
  name: string
  contact: string
  message: string
  branchInterest?: string
}): Promise<void> {
  const { error } = await supabase.from('inquiries').insert({
    name: input.name,
    contact: input.contact,
    message: input.message,
    branch_interest: input.branchInterest || null,
  })
  if (error) throw error
}

/** Staff: list all inquiries, newest first */
export async function fetchInquiries(): Promise<Inquiry[]> {
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Inquiry[]) ?? []
}

/** Staff: update status and optional reply notes */
export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
  replyNotes?: string,
  repliedBy?: string,
): Promise<void> {
  const { error } = await supabase
    .from('inquiries')
    .update({
      status,
      reply_notes: replyNotes ?? null,
      replied_by: repliedBy ?? null,
      replied_at: repliedBy ? new Date().toISOString() : null,
    })
    .eq('id', id)
  if (error) throw error
}

