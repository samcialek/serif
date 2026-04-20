import { useState, useMemo } from 'react';
import { CheckCircle2, Circle, Clock, Link2, Sun, Moon, Coffee, Code2 } from 'lucide-react';
import { cn } from '@/utils/classNames';
import type { DailyProtocolItem } from '@/data/clients/userData';
import { DataInspector } from './DataInspector';
import { getProtocolInspectorData } from '@/data/clients/samplePayloads';

interface DailyProtocolProps {
  items: DailyProtocolItem[];
  date?: string;
  clientId?: string;
  onToggle?: (index: number, completed: boolean) => void;
  className?: string;
}

const timeIcons: Record<string, React.ElementType> = {
  Morning: Sun,
  'After dinner': Moon,
  Evening: Moon,
  Afternoon: Coffee,
  Anytime: Clock,
};

export function DailyProtocol({ items, date, clientId, onToggle, className }: DailyProtocolProps) {
  const [completedItems, setCompletedItems] = useState<Set<number>>(
    new Set(items.filter((i) => i.completed).map((_, idx) => idx))
  );
  const [showInspector, setShowInspector] = useState(false);
  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null);

  // Get inspector data for the selected protocol item
  const inspectorData = useMemo(() => {
    if (!selectedItemCode || !clientId) return null;
    return getProtocolInspectorData(selectedItemCode, clientId);
  }, [selectedItemCode, clientId]);

  const selectedItem = items.find((item) => item.code === selectedItemCode);

  const handleViewData = (code: string) => {
    setSelectedItemCode(code);
    setShowInspector(true);
  };

  const formattedDate =
    date ||
    new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const handleToggle = (index: number) => {
    const newCompleted = new Set(completedItems);
    if (newCompleted.has(index)) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
    }
    setCompletedItems(newCompleted);
    onToggle?.(index, !completedItems.has(index));
  };

  const completedCount = completedItems.size;
  const totalCount = items.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-50 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Today's Protocol</h3>
            <p className="text-sm text-gray-500">{formattedDate}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-2xl font-bold text-gray-900">{completedCount}</span>
              <span className="text-gray-400">/{totalCount}</span>
            </div>
            <div className="w-12 h-12 relative">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle cx="24" cy="24" r="20" fill="none" stroke="#E5E7EB" strokeWidth="4" />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${progressPct * 1.26} 126`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700">
                {progressPct}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Items */}
      <div className="divide-y divide-gray-50">
        {items
          .sort((a, b) => a.priority - b.priority)
          .map((item, index) => {
            const isCompleted = completedItems.has(index);
            const TimeIcon = item.timeOfDay ? timeIcons[item.timeOfDay] || Clock : Clock;

            return (
              <div
                key={index}
                className={cn(
                  'p-4 flex items-start gap-3 transition-colors',
                  isCompleted ? 'bg-green-50/50' : 'hover:bg-gray-50'
                )}
              >
                {/* Checkbox */}
                <button
                  onClick={() => handleToggle(index)}
                  className={cn(
                    'flex-shrink-0 mt-0.5 transition-colors',
                    isCompleted ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold',
                        item.priority === 1
                          ? 'bg-amber-100 text-amber-700'
                          : item.priority === 2
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      {item.priority}
                    </span>
                    <span
                      className={cn(
                        'font-medium',
                        isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'
                      )}
                    >
                      {item.action}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'text-sm ml-7',
                      isCompleted ? 'text-gray-400' : 'text-gray-500'
                    )}
                  >
                    {item.reason}
                  </p>

                  {/* Tags */}
                  <div className="flex items-center gap-2 mt-2 ml-7">
                    {item.timeOfDay && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                        <TimeIcon className="w-3 h-3" />
                        {item.timeOfDay}
                      </span>
                    )}
                    {item.linkedInsightId && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 rounded text-xs text-primary-600">
                        <Link2 className="w-3 h-3" />
                        Linked insight
                      </span>
                    )}
                    {clientId && item.code && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewData(item.code);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 hover:bg-primary-50 rounded text-xs text-gray-500 hover:text-primary-600 border border-gray-200 hover:border-primary-200 transition-colors"
                      >
                        <Code2 className="w-3 h-3" />
                        View Data
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Footer */}
      {completedCount === totalCount && (
        <div className="p-4 bg-green-50 border-t border-green-100">
          <p className="text-sm text-green-700 font-medium text-center">
            All items completed! Great work today.
          </p>
        </div>
      )}

      {/* Data Inspector Modal */}
      {inspectorData && selectedItem && (
        <DataInspector
          isOpen={showInspector}
          onClose={() => {
            setShowInspector(false);
            setSelectedItemCode(null);
          }}
          data={inspectorData}
          title={selectedItem.action}
        />
      )}
    </div>
  );
}

export default DailyProtocol;
