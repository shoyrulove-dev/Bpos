import ReceiptPrintClient from './ReceiptPrintClient'

export default function ReceiptPrintPage({ params }: { params: { id: string } }) {
  return <ReceiptPrintClient orderId={params.id} />
}
