import { Calendar, Activity, CheckCircle2, Lightbulb, Watch, Smartphone, FlaskConical, Scale, Heart, Cloud } from 'lucide-react';
import { cn } from '@/utils/classNames';

interface DataSourceBadge {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  lastSync?: string;
}

interface UserProfileHeaderProps {
  name: string;
  avatar?: string;
  archetype: string;
  clientName: string;
  clientLogo?: string;
  enrollmentDate: string;
  activeDays: number;
  complianceRate: number;
  currentPhase: string;
  tags: string[];
  dataSources: DataSourceBadge[];
  additionalStats?: { label: string; value: string | number }[];
  className?: string;
}

const iconMap: Record<string, React.ElementType> = {
  watch: Watch,
  smartphone: Smartphone,
  flask: FlaskConical,
  scale: Scale,
  heart: Heart,
  activity: Activity,
  cloud: Cloud,
};

export function UserProfileHeader({
  name,
  avatar,
  archetype,
  clientName,
  clientLogo,
  enrollmentDate,
  activeDays,
  complianceRate,
  currentPhase,
  tags,
  dataSources,
  additionalStats = [],
  className,
}: UserProfileHeaderProps) {
  const formattedDate = new Date(enrollmentDate).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className={cn('bg-white rounded-xl border border-gray-100 p-6', className)}>
      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          <div
            className={cn(
              'w-20 h-20 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg border-4 border-white',
              avatar && 'hidden'
            )}
          >
            {name.charAt(0)}
          </div>
        </div>

        {/* Profile Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-gray-900 truncate">{name}</h2>
            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium flex items-center gap-1.5">
              {clientLogo && <span>{clientLogo}</span>}
              {clientName}
            </span>
          </div>
          <p className="text-lg text-primary-600 font-medium mb-2">"{archetype}"</p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-600">
                <strong>{activeDays}</strong> days active
              </span>
              <span className="text-gray-400">since {formattedDate}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-gray-600">
                <strong>{complianceRate}%</strong> compliance
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600">
                Phase: <strong>{currentPhase}</strong>
              </span>
            </div>
            {additionalStats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2 text-sm">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                <span className="text-gray-600">
                  <strong>{stat.value}</strong> {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Sources */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
          Connected Data Sources
        </p>
        <div className="flex flex-wrap gap-2">
          {dataSources.map((source) => {
            const Icon = iconMap[source.icon] || Activity;
            return (
              <div
                key={source.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium',
                  source.connected
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                )}
              >
                <Icon className="w-4 h-4" />
                {source.name}
                {source.connected && (
                  <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default UserProfileHeader;
