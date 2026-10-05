import { useState } from 'react'
import { btn, btnPrimary } from '../components/ui'
import type { Property } from '../types'
import MapEditor from './MapEditor'
import PricingSettings from './PricingSettings'
import PropertySettings from './PropertySettings'
import StaffSettings from './StaffSettings'

type Tab = 'map' | 'pricing' | 'staff' | 'properties'

// Nhãn ngắn để bốn tab vừa một hàng trên điện thoại.
const TABS: { tab: Tab; label: string }[] = [
  { tab: 'map', label: 'Sơ đồ' },
  { tab: 'pricing', label: 'Cài đặt' },
  { tab: 'staff', label: 'Nhân viên' },
  { tab: 'properties', label: 'Cơ sở' },
]

interface Props {
  property: Property
  currentUserId: string
}

// Mọi thứ chỉ chủ được sửa: sơ đồ, giá và dịch vụ của cơ sở đang mở, nhân viên, danh sách cơ sở.
export default function Manage({ property, currentUserId }: Props) {
  const [tab, setTab] = useState<Tab>('map')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.tab}
            type="button"
            aria-pressed={tab === item.tab}
            className={tab === item.tab ? btnPrimary : btn}
            onClick={() => setTab(item.tab)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'map' && <MapEditor propertyId={property.id} />}
      {tab === 'pricing' && <PricingSettings property={property} />}
      {tab === 'staff' && <StaffSettings currentUserId={currentUserId} />}
      {tab === 'properties' && <PropertySettings currentPropertyId={property.id} />}
    </div>
  )
}
