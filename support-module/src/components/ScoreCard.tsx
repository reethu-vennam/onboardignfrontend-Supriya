import React from 'react';

export interface ScoreCategory {
    label: string;
    earned: number;
    max: number;
}

export interface ScoreCardData {
    score: number;
    categories: ScoreCategory[];
    reasons: string[];
    isManualReview: boolean;
}

interface ScoreCardProps {
    data: ScoreCardData;
    loading?: boolean;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({ data, loading = false }) => {
    if (loading) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                <div className="flex items-center gap-6">
                    <div className="h-12 w-20 bg-gray-200 rounded"></div>
                    <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-48 mb-3"></div>
                        <div className="flex gap-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-5 bg-gray-200 rounded w-24"></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start gap-6">
                {/* Left: Score */}
                <div className="shrink-0 text-center">
                    <div className="text-4xl font-bold text-gray-900 leading-none">{data.score}</div>
                    <div className="text-sm text-gray-400 mt-0.5">/ 100</div>
                </div>

                {/* Right: Title + Categories + Reasons */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-semibold text-gray-800">Overall Trust Score</h3>
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-3">
                        {data.categories.map((cat) => {
                            const pct = cat.max > 0 ? cat.earned / cat.max : 0;
                            const color = pct >= 1
                                ? 'text-green-600'
                                : pct >= 0.5
                                    ? 'text-amber-600'
                                    : 'text-red-600';

                            return (
                                <div key={cat.label} className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                                    <span className="text-gray-500">{cat.label}</span>
                                    <span className={`font-semibold ${color}`}>
                                        {cat.earned}/{cat.max}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {data.reasons.length > 0 && (
                        <div className="border-t pt-3">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reasons</p>
                            <div className="flex flex-wrap gap-1.5">
                                {data.reasons.map((reason, i) => (
                                    <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                        {reason}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
