import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';
import { NhaCungCapXacThuc, NhaCungCapGiaoDien, NhaCungCapCoChu } from './ngu-canh.jsx';
import { NhaCungCapThongBao } from './thanh-phan.jsx';
import './giao-dien.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <NhaCungCapGiaoDien>
        <NhaCungCapCoChu>
        <NhaCungCapThongBao>
          <NhaCungCapXacThuc>
            <App />
          </NhaCungCapXacThuc>
        </NhaCungCapThongBao>
      </NhaCungCapCoChu>
      </NhaCungCapGiaoDien>
    </BrowserRouter>
  </React.StrictMode>,
);
