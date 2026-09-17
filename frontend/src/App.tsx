import { Route, Routes } from "react-router-dom";
import AppShell from "@/components/AppShell";
import "@/brand-overrides.css";
import { Toaster } from "@/components/ui/sonner";
import Activities from "@/pages/Activities";
import AuditLog from "@/pages/AuditLog";
import CustomerDetail from "@/pages/CustomerDetail";
import CustomerImport from "@/pages/CustomerImport";
import Customers from "@/pages/Customers";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import OrderMonitoring from "@/pages/OrderMonitoring";
import Pipeline from "@/pages/Pipeline";
import Products from "@/pages/Products";
import PurchaseOrderView from "@/pages/PurchaseOrderView";
import PurchaseOrders from "@/pages/PurchaseOrders";
import QuotationView from "@/pages/QuotationView";
import Quotations from "@/pages/Quotations";
import SalesTeam from "@/pages/SalesTeam";
import Settings from "@/pages/Settings";
import Targets from "@/pages/Targets";
import Users from "@/pages/Users";

export default function App() {
  return <><Routes><Route path="/login" element={<Login />} /><Route element={<AppShell />}><Route path="/" element={<Dashboard />} /><Route path="/customers" element={<Customers />} /><Route path="/customers/import" element={<CustomerImport />} /><Route path="/customers/:customerId" element={<CustomerDetail />} /><Route path="/pipeline" element={<Pipeline />} /><Route path="/activities" element={<Activities />} /><Route path="/quotations" element={<Quotations />} /><Route path="/quotations/:quotationId" element={<QuotationView />} /><Route path="/purchase-orders" element={<PurchaseOrders />} /><Route path="/purchase-orders/:poId" element={<PurchaseOrderView />} /><Route path="/order-monitoring" element={<OrderMonitoring />} /><Route path="/sales-team" element={<SalesTeam />} /><Route path="/targets" element={<Targets />} /><Route path="/audit-log" element={<AuditLog />} /><Route path="/users" element={<Users />} /><Route path="/products" element={<Products />} /><Route path="/settings" element={<Settings />} /></Route></Routes><Toaster position="bottom-right" richColors /></>;
}
