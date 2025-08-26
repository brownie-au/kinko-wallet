// src/components/GlobalSparkline.jsx
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

export default function GlobalSparkline({ data, field, height = 72 }) {
    if (!data?.length) return null;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data}>
                <defs>
                    <linearGradient id={`grad-${field}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <Area
                    type="monotone"         // <-- smooth like your ref chart
                    dataKey={field}
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill={`url(#grad-${field})`}
                    isAnimationActive={true}
                    animationDuration={650}
                    dot={false}
                    activeDot={false}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
}
