"use client";

import React, { useEffect, useState } from 'react';

// Common chart configuration for dashboard
export const CHART_CONFIG = {
    // Use a light theme by default, can be extended for dark mode
    theme: 'light',
};

// Wrapper ensuring VChart is only loaded on client side
export const VChartWrapper = ({ spec, ...props }: any) => {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return null;

    // Dynamically import VChart to avoid SSR issues
    const { VChart } = require('@visactor/react-vchart');
    return <VChart spec={spec} {...props} />;
};
