import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.jsx';
import { NhaCungCapXacThuc, NhaCungCapGiaoDien, NhaCungCapCoChu } from './nguCanh.jsx';
import { NhaCungCapThongBao } from './thanhPhan.jsx';
import './giaoDien.css';

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
