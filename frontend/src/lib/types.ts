// Hand-written mirrors of the backend Pydantic models. Keep in sync with backend/routers/*.py.

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface Me {
  user_id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "SALES_MANAGER" | "SALES";
  manager_id?: string | null;
  phone?: string | null;
  status: string;
  must_change_password?: boolean;
  signature_image?: string | null;
  signature_title?: string | null;
}

export interface UserRow {
  user_id: string;
  name: string;
  email: string;
  role: string;
  manager_id?: string | null;
  manager_name?: string | null;
  phone?: string | null;
  status: string;
  last_login?: string | null;
  signature_title?: string | null;
  has_signature?: boolean;
}

export interface SalesOption {
  user_id: string;
  name: string;
  role: string;
}

export interface CustomerRow {
  customer_id: string;
  customer_name: string;
  company?: string | null;
  industry?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  pic_name?: string | null;
  sales_id?: string | null;
  sales_name?: string | null;
  status: string;
}

export interface CustomerDetail extends CustomerRow {
  address?: string | null;
  province?: string | null;
  pic_position?: string | null;
  source?: string | null;
  notes?: string | null;
  created_date?: string | null;
  updated_date?: string | null;
}

export interface CustomerOption {
  customer_id: string;
  customer_name: string;
  company?: string | null;
}

export interface ProductRow {
  product_id: string;
  product_code?: string | null;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  unit: string;
  default_price: number;
  supplier?: string | null;
  distributor?: string | null;
  status: string;
}

export interface OpportunityRow {
  opportunity_id: string;
  opportunity_name: string;
  customer_id: string;
  customer_name?: string | null;
  sales_id?: string | null;
  sales_name?: string | null;
  value: number;
  probability: number;
  weighted_value: number;
  stage: string;
  expected_close_date?: string | null;
  source?: string | null;
  notes?: string | null;
}

export interface StageSummary {
  stage: string;
  count: number;
  value: number;
  weighted_value: number;
}

export interface KanbanColumn {
  stage: string;
  count: number;
  value: number;
  items: OpportunityRow[];
}

export interface QuotationItem {
  quotation_item_id: string;
  product_id?: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  discount: number;
  subtotal: number;
}

export interface QuotationRow {
  quotation_id: string;
  quotation_number: string;
  quotation_date?: string | null;
  customer_id: string;
  customer_name?: string | null;
  sales_id?: string | null;
  sales_name?: string | null;
  grand_total: number;
  status: string;
  validity_date?: string | null;
}

export interface QuotationDetail extends QuotationRow {
  opportunity_id?: string | null;
  payment_term?: string | null;
  delivery_term?: string | null;
  notes?: string | null;
  subtotal: number;
  discount: number;
  tax_percent: number;
  tax: number;
  items: QuotationItem[];
  customer_company?: string | null;
  customer_pic_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  signature_image?: string | null;
  signature_name?: string | null;
  signature_title?: string | null;
}

export interface POItem {
  po_item_id: string;
  product_id?: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  subtotal: number;
}

export interface PORow {
  po_id: string;
  po_number: string;
  po_date?: string | null;
  customer_id: string;
  customer_name?: string | null;
  quotation_number?: string | null;
  sales_id?: string | null;
  sales_name?: string | null;
  po_value: number;
  status: string;
}

export interface PODetail extends PORow {
  quotation_id?: string | null;
  delivery_address?: string | null;
  payment_term?: string | null;
  notes?: string | null;
  document_name?: string | null;
  items: POItem[];
}

export interface MonitoringRow {
  monitoring_id: string;
  po_id?: string | null;
  po_number?: string | null;
  customer_name?: string | null;
  product_name?: string | null;
  qty: number;
  status: string;
  supplier?: string | null;
  eta?: string | null;
  sales_name?: string | null;
  actual_delivery_date?: string | null;
  eta_flag: string;
}

export interface MonitoringSummary {
  total: number;
  indent: number;
  ready_stock: number;
  delivery: number;
  completed: number;
  overdue: number;
}

export interface ActivityRow {
  activity_id: string;
  sales_id?: string | null;
  sales_name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  opportunity_id?: string | null;
  activity_type: string;
  activity_date?: string | null;
  subject: string;
  description?: string | null;
  next_followup?: string | null;
  status: string;
}

export interface ActivitySummary {
  today: number;
  upcoming: number;
  overdue: number;
  completed: number;
}

export interface DashboardKPI {
  total_customers: number;
  open_pipeline: number;
  weighted_pipeline: number;
  won_value: number;
  total_quotations: number;
  total_po: number;
  po_value: number;
  activities: number;
  open_orders: number;
  completed_orders: number;
  overdue_orders: number;
}

export interface StageBar {
  stage: string;
  count: number;
  value: number;
}

export interface DashboardResponse {
  kpi: DashboardKPI;
  pipeline_by_stage: StageBar[];
}

export interface SalesKPIRow {
  sales_id: string;
  sales_name: string;
  role: string;
  manager_name?: string | null;
  open_pipeline: number;
  weighted_pipeline: number;
  won_value: number;
  quotations: number;
  po_count: number;
  po_value: number;
  activities: number;
  indent: number;
  overdue: number;
}

export interface AuditRow {
  user_id: string;
  user_name?: string | null;
  action: string;
  module: string;
  record_id?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  timestamp?: string | null;
}
