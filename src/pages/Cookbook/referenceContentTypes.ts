import { Lightbulb, Leaf, Package, Scale, Table, UtensilsCrossed, BookOpen, FileText } from 'lucide-react'
import type { ReferenceContentType } from '@/types'

export interface ContentTypeInfo {
  value: ReferenceContentType
  label: string
  emoji: string
  Icon: typeof Lightbulb
}

export const CONTENT_TYPES: ContentTypeInfo[] = [
  { value: 'tips',         label: 'Tips & Hints',         emoji: '📋', Icon: Lightbulb },
  { value: 'herbs',        label: 'Herbs & Spices',       emoji: '🌿', Icon: Leaf },
  { value: 'pantry',       label: 'Pantry Lists',         emoji: '📦', Icon: Package },
  { value: 'measurements', label: 'Measurements',         emoji: '⚖️', Icon: Scale },
  { value: 'charts',       label: 'Charts & Tables',      emoji: '🌡️', Icon: Table },
  { value: 'presentation', label: 'Table & Presentation', emoji: '🍽️', Icon: UtensilsCrossed },
  { value: 'terms',        label: 'Cooking Terms',        emoji: '📖', Icon: BookOpen },
  { value: 'notes',        label: 'Personal Notes',       emoji: '📝', Icon: FileText },
]

export const CONTENT_TYPE_VALUES = CONTENT_TYPES.map(c => c.value)
