import React, { useState } from 'react';
import CameraFeeds from './CameraFeeds';
import '../css/ControlPanel.css';

const VIDEO_SERVER_URL = 'http://localhost:5000';

/**
 * ControlPanel 컴포넌트 - 카메라 모니터링 및 측정 기능을 제공
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - children에 대한 설명
 * @returns {React.Component} React 컴포넌트
 */
const ControlPanel = ({ children }) => {
    const [message, setMessage] = useState('');

    return (
        <div className="control-panel">
            <CameraFeeds 
                videoServerUrl={VIDEO_SERVER_URL}
                message={message}
            />
            {children}
        </div>
    );
};

export default ControlPanel;
