import OrderDetailView from '@/components/orders/OrderDetailView'

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  return <OrderDetailView orderId={params.id} />
}