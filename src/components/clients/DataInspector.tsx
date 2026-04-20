import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ArrowRight,
  Database,
  Cpu,
  Send,
  FileJson,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';
import { Button, Badge } from '@/components/common';
import { JsonViewer } from '@/components/common/JsonViewer';
import type { InspectorData } from '@/types/apiContracts';
import { cn } from '@/utils/classNames';

interface DataInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  data: InspectorData;
  title: string;
}

type TabId = 'inbound' | 'model' | 'outbound';

/**
 * DataInspector Modal
 * Shows the data pipeline: Inbound (device data) → Model → Outbound (API response)
 * Used to demonstrate Serif's data transformation and API contracts
 */
export function DataInspector({ isOpen, onClose, data, title }: DataInspectorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('inbound');
  const [expandedInbound, setExpandedInbound] = useState<number>(0);

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'inbound',
      label: 'Inbound Data',
      icon: <Database className="w-4 h-4" />,
      count: data.inbound.length,
    },
    {
      id: 'model',
      label: 'Model',
      icon: <Cpu className="w-4 h-4" />,
    },
    {
      id: 'outbound',
      label: 'Outbound Response',
      icon: <Send className="w-4 h-4" />,
    },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Data Pipeline Inspector</h2>
              <p className="text-sm text-gray-500 mt-0.5">{title}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Flow Diagram */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                <Database className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-700">Device/Lab Data</span>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                <Cpu className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium text-gray-700">Serif Model</span>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                <Send className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-gray-700">API Response</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab.id
                    ? 'text-primary-600 border-primary-500'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
                )}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && (
                  <Badge variant="outline" className="ml-1 text-xs">
                    {tab.count}
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-6">
            {activeTab === 'inbound' && (
              <InboundTab
                data={data.inbound}
                expandedIndex={expandedInbound}
                onExpandChange={setExpandedInbound}
              />
            )}
            {activeTab === 'model' && data.model && <ModelTab model={data.model} />}
            {activeTab === 'outbound' && <OutboundTab data={data.outbound} />}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              <FileJson className="w-3.5 h-3.5 inline mr-1" />
              All data structures follow FHIR-analogous schemas
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Inbound Data Tab
interface InboundTabProps {
  data: InspectorData['inbound'];
  expandedIndex: number;
  onExpandChange: (index: number) => void;
}

function InboundTab({ data, expandedIndex, onExpandChange }: InboundTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Badge variant="outline" className="text-blue-600 border-blue-200">
          <Database className="w-3 h-3 mr-1" />
          {data.length} Data Source{data.length !== 1 ? 's' : ''}
        </Badge>
        <span className="text-sm text-gray-500">
          Raw data received from devices and labs
        </span>
      </div>

      {data.map((source, index) => (
        <div
          key={index}
          className="border border-gray-200 rounded-lg overflow-hidden"
        >
          <button
            onClick={() => onExpandChange(expandedIndex === index ? -1 : index)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              {expandedIndex === index ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
              <div className="text-left">
                <p className="font-medium text-gray-900">{source.label}</p>
                <p className="text-xs text-gray-500">{source.description}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {source.schema}
            </Badge>
          </button>

          {expandedIndex === index && (
            <div className="p-4 border-t border-gray-200">
              <JsonViewer
                data={source.data}
                theme="dark"
                expandLevel={2}
                showCopy={true}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Model Tab
interface ModelTabProps {
  model: NonNullable<InspectorData['model']>;
}

function ModelTab({ model }: ModelTabProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(model.computation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Badge variant="outline" className="text-purple-600 border-purple-200">
          <Cpu className="w-3 h-3 mr-1" />
          {model.label}
        </Badge>
        <span className="text-sm text-gray-500">{model.description}</span>
      </div>

      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-md transition-colors z-10"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        <pre className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-[400px] text-sm font-mono">
          <code className="text-gray-200 whitespace-pre-wrap">{model.computation}</code>
        </pre>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> This is a simplified representation of the model computation.
          The actual implementation includes additional statistical validation, edge case handling,
          and performance optimizations.
        </p>
      </div>
    </div>
  );
}

// Outbound Response Tab
interface OutboundTabProps {
  data: InspectorData['outbound'];
}

function OutboundTab({ data }: OutboundTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Badge variant="outline" className="text-green-600 border-green-200">
          <Send className="w-3 h-3 mr-1" />
          API Response
        </Badge>
        <span className="text-sm text-gray-500">{data.description}</span>
      </div>

      <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Schema</p>
          <p className="font-mono text-sm text-gray-700">{data.schema}</p>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Label</p>
          <p className="text-sm text-gray-700">{data.label}</p>
        </div>
      </div>

      <JsonViewer
        data={data.data}
        theme="dark"
        expandLevel={3}
        showCopy={true}
      />
    </div>
  );
}

export default DataInspector;
