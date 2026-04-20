import React, { useState, useEffect } from 'react';
import { FileText, Upload, Send, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [incidencias, setIncidencias] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });

  // Simulación de carga desde data.json (que generará Python)
  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Intentamos cargar el JSON generado por processor.py
      // Nota: En desarrollo con Vite, el JSON debe estar en la carpeta public o servirse localmente
      const response = await fetch('/data.json'); 
      if (!response.ok) throw new Error('No se encontró data.json');
      const data = await response.json();
      setIncidencias(data);
      setStatus({ type: 'success', msg: `¡${data.length} incidencias cargadas!` });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', msg: 'Error: Genera el archivo data.json con processor.py primero.' });
    } finally {
      setLoading(false);
    }
  };

  const handleEnviar = (e) => {
    e.preventDefault();
    setStatus({ type: 'info', msg: 'Enviando a Google Sheets...' });
    setTimeout(() => {
      setStatus({ type: 'success', msg: '¡Guardado con éxito en Incidencias 2026!' });
      setSelected(null);
    }, 2000);
  };

  return (
    <div className="container p-8 max-w-6xl mx-auto">
      <header className="mb-12 text-center animate-fade-in">
        <h1 className="flex items-center justify-center gap-3">
          <FileText size={40} className="text-indigo-400" />
          Gestión de Incidencias 2026
        </h1>
        <p className="text-slate-400 text-lg">Sistema inteligente de reporte y seguimiento</p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-4 space-y-4">
          <div className="glass-card">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Upload size={20} className="text-indigo-400" />
              Cargar Reportes
            </h2>
            <button 
              onClick={cargarDatos}
              className="btn w-full justify-center"
              disabled={loading}
            >
              {loading ? 'Procesando...' : 'Sincronizar con Excel'}
            </button>
            <p className="mt-3 text-xs text-slate-500 text-center">
              Se utilizará Pandas para procesar el archivo Excel seleccionado.
            </p>
          </div>

          <div className="glass-card">
            <h3 className="font-semibold mb-3 text-slate-300">Estado del Sistema</h3>
            {status.msg && (
              <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                status.type === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 
                status.type === 'error' ? 'bg-rose-500/20 text-rose-300' : 'bg-blue-500/20 text-blue-300'
              }`}>
                {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {status.msg}
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {incidencias.length > 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid gap-4"
              >
                {incidencias.map((item, idx) => (
                  <motion.div
                    key={idx}
                    whileHover={{ scale: 1.02 }}
                    className={`glass-card cursor-pointer transition-all ${selected === item ? 'border-indigo-500 ring-2 ring-indigo-500/20' : ''}`}
                    onClick={() => setSelected(item)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 mb-1 block">
                          Ref: {item.ref} | {item["CLASIFICACION DE LA INCIDENCIA"]}
                        </span>
                        <h3 className="text-lg font-bold">{item.PROPIEDAD}</h3>
                        <p className="text-slate-400 text-sm mt-1 line-clamp-1">{item["DESCRIPCION DE LA INCIDENCIA"]}</p>
                      </div>
                      <ChevronRight className="text-slate-600" />
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="glass-card text-center py-20">
                <Upload size={48} className="mx-auto text-slate-700 mb-4" />
                <p className="text-slate-500">No hay datos cargados. Pulsa "Sincronizar" para empezar.</p>
              </div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Modal de Formulario */}
      <AnimatePresence>
        {selected && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Completar Incidencia</h2>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <form onSubmit={handleEnviar} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Propiedad</label>
                  <input type="text" readOnly value={selected.PROPIEDAD} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-300" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Responsable</label>
                  <input type="text" readOnly value={selected["RESPONSABLE DEL REPORTE"]} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-300" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha</label>
                  <input type="date" value={selected["FECHA REPORTE INCIDENCIA"]} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label>
                  <textarea rows="3" defaultValue={selected["DESCRIPCION DE LA INCIDENCIA"]} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"></textarea>
                </div>
                
                <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-bold text-indigo-400 mb-3">Datos de Resolución</h3>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Operario</label>
                  <input type="text" placeholder="Nombre operario..." className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Costo Mano Obra</label>
                  <input type="number" placeholder="0.00" className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Acción Tomada</label>
                  <textarea rows="2" className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none"></textarea>
                </div>

                <div className="md:col-span-2 flex justify-end gap-3 mt-6">
                  <button type="button" onClick={() => setSelected(null)} className="btn btn-secondary">Cancelar</button>
                  <button type="submit" className="btn">
                    <Send size={18} />
                    Guardar en Sheet
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
