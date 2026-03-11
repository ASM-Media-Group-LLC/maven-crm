

## Upgrade ClosersKPICards to use DashboardMetricCard

The current `ClosersKPICards` uses plain cards with `border-t` styling. The reference image shows the `DashboardMetricCard` pattern: icon with colored background on the left, label/value/subtitle on the right, with hover effects. This is the same component already used across the system.

### Changes

**Edit `src/pages/closers/components/ClosersKPICards.tsx`**:
- Import `DashboardMetricCard` from `@/components/dashboard/DashboardMetricCard`
- Import icons from lucide-react: `UserCheck`, `MessageSquare`, `CheckCircle`, `Trophy`, `DollarSign`, `TrendingUp`
- Replace the manual Card rendering with a grid of `DashboardMetricCard` components
- Map each KPI to the appropriate icon and color:
  - Asignadas → `UserCheck`, primary
  - En Negociación → `MessageSquare`, accent
  - Confirmadas → `CheckCircle`, success
  - Completadas → `Trophy`, success
  - Monetización Est. → `DollarSign`, warning
  - Revenue Agencia → `TrendingUp`, primary
- Keep the same 6-column grid layout

