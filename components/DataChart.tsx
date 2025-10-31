
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { SoilData } from '../types';

interface DataChartProps {
  data: SoilData[];
}

const DataChart: React.FC<DataChartProps> = ({ data }) => {
  return (
    <div className="my-4 bg-white p-4 rounded-xl shadow-md">
      <div className="h-80 w-full">
        <ResponsiveContainer>
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 20,
              left: -10,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis dataKey="timeLabel" stroke="#6b7280" />
            <YAxis yAxisId="left" stroke="#27ae60" label={{ value: 'Độ ẩm (%)', angle: -90, position: 'insideLeft', fill: '#27ae60' }} />
            <YAxis yAxisId="right" orientation="right" stroke="#e74c3c" domain={[0, 14]} label={{ value: 'pH', angle: 90, position: 'insideRight', fill: '#e74c3c' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                backdropFilter: 'blur(2px)',
                border: '1px solid #ccc',
                borderRadius: '8px'
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }}/>
            <Line yAxisId="left" type="monotone" dataKey="moisture" name="Độ ẩm (%)" stroke="#27ae60" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 6 }} />
            <Line yAxisId="right" type="monotone" dataKey="pH" name="pH" stroke="#e74c3c" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default DataChart;
