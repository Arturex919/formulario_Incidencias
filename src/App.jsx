import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Send, CheckCircle, AlertCircle, ChevronDown,
  User, Home, Calendar, ClipboardList, Wrench, DollarSign,
  MessageSquare, PlusCircle, Loader2, Moon, Sun
} from 'lucide-react';

// ─── Opciones del desplegable (igual que en el Excel) ──────────────────────────
const CLASIFICACIONES = [
  "AVERÍA",
  "MANTENIMIENTO",
  "LIMPIEZA",
  "INSTALACIONES",
  "ELECTRODOMÉSTICOS",
  "FONTANERÍA",
  "ELECTRICIDAD",
  "CARPINTERÍA",
  "PINTURA",
  "CLIMATIZACIÓN",
  "JARDÍN / EXTERIOR",
  "SEGURIDAD",
  "SUMINISTROS",
  "CHECK-IN / CHECK-OUT",
  "INCIDENCIA CON HUÉSPED",
  "Otro",
];

const ESTADOS_INICIALES = ["PENDIENTE", "EN PROCESO", "RESUELTO"];

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby-TDE7HoQ4k0kaKOxrUmSTvUCvMWsu0hHaBUjUlwruOszizehtI1YbxFmWghluOrFzhA/exec";

// ─── Estado inicial del formulario ────────────────────────────────────────────
const FORM_INICIAL = {
  responsable: "",
  fecha: new Date().toISOString().split("T")[0],
  ref: "",
  propiedad: "",
  clasificacion: "",
  clasificacionOtro: "",
  descripcion: "",
  operario: "",
  costoManoObra: "",
  accionTomada: "",
  estado: "PENDIENTE",
};

// ─── Componente principal ──────────────────────────────────────────────────────
export default function App() {
  const [form, setForm]             = useState(FORM_INICIAL);
  const [loading, setLoading]       = useState(false);
  const [status, setStatus]         = useState({ type: "", msg: "" });
  const [showSuccess, setShowSuccess] = useState(false);

  // ── Tema ──────────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const clasificacionFinal =
    form.clasificacion === "Otro" ? form.clasificacionOtro : form.clasificacion;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.responsable || !form.propiedad || !form.clasificacion || !form.descripcion) {
      setStatus({ type: "error", msg: "Por favor, rellena los campos obligatorios (*)." });
      return;
    }
    if (form.clasificacion === "Otro" && !form.clasificacionOtro.trim()) {
      setStatus({ type: "error", msg: 'Especifica el tipo de incidencia en el campo "Otro".' });
      return;
    }

    setLoading(true);
    setStatus({ type: "info", msg: "Enviando a Google Sheets..." });

    const payload = {
      "ref":                            form.ref,
      "PROPIEDAD":                      form.propiedad,
      "CLASIFICACION DE LA INCIDENCIA": clasificacionFinal,
      "DESCRIPCION DE LA INCIDENCIA":   form.descripcion,
      "OPERARIO":                       form.operario,
      "ESTADO":                         form.estado,
      "ACCION TOMADA":                  form.accionTomada,
      "FECHA":                          form.fecha,
      "costo mano obra":                form.costoManoObra,
      "RESPONSABLE DEL REPORTE":        form.responsable,
    };

    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify(payload),
      });

      // En modo no-cors no podemos leer la respuesta, pero si no hay error de red, asumimos éxito
      setStatus({ type: "success", msg: "¡Incidencia enviada correctamente a Google Sheets!" });
      setShowSuccess(true);
      setForm(FORM_INICIAL);
      setTimeout(() => setShowSuccess(false), 4000);

    } catch (error) {
      console.error("Error al enviar:", error);
      setStatus({ type: "error", msg: "Error de red: " + error.message });
    } finally {
      setLoading(false);
    }
  };

  // Función para descargar una copia local si falla la red
  const downloadBackup = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(form, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `incidencia_${form.propiedad || 'sin_nombre'}_${form.fecha}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setStatus({ type: "info", msg: "Copia de seguridad descargada localmente." });
  };

  return (
    <div className="page-wrap">

      {/* ── TOAST ──────────────────────────────────── */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            className="toast toast-success"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
          >
            <CheckCircle size={20} />
            ¡Incidencia registrada en la hoja "Incidencia 2026"!
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CABECERA ───────────────────────────────── */}
      <header className="app-header animate-fade-in">
        <div className="header-left">
          <div className="header-icon-wrap">
            <FileText size={30} />
          </div>
          <div>
            <h1>Incidencias 2026</h1>
            <p className="subtitle">Sistema de reporte y seguimiento de incidencias</p>
          </div>
        </div>

        {/* Botón toggle tema */}
        <button
          className="theme-toggle"
          onClick={() => setDarkMode((d) => !d)}
          title={darkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-label="Cambiar tema"
        >
          <AnimatePresence mode="wait" initial={false}>
            {darkMode ? (
              <motion.span
                key="sun"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0,   opacity: 1 }}
                exit={{   rotate:  90, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="theme-icon"
              >
                <Sun size={20} />
              </motion.span>
            ) : (
              <motion.span
                key="moon"
                initial={{ rotate: 90,  opacity: 0 }}
                animate={{ rotate: 0,   opacity: 1 }}
                exit={{   rotate: -90,  opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="theme-icon"
              >
                <Moon size={20} />
              </motion.span>
            )}
          </AnimatePresence>
          <span className="theme-label">{darkMode ? "Modo claro" : "Modo oscuro"}</span>
        </button>
      </header>

      {/* ── FORMULARIO ─────────────────────────────── */}
      <motion.div
        className="glass-card form-card animate-fade-in"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="form-section-title">
          <PlusCircle size={20} className="icon-accent" />
          <span>Nueva Incidencia</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>

          {/* FILA 1 */}
          <div className="form-grid">
            <div className="field-group">
              <label htmlFor="responsable">
                <User size={14} /> Responsable del reporte <span className="req">*</span>
              </label>
              <input id="responsable" name="responsable" type="text"
                placeholder="Nombre del responsable..."
                value={form.responsable} onChange={handleChange} required />
            </div>
            <div className="field-group">
              <label htmlFor="fecha">
                <Calendar size={14} /> Fecha del reporte <span className="req">*</span>
              </label>
              <input id="fecha" name="fecha" type="date"
                value={form.fecha} onChange={handleChange} required />
            </div>
          </div>

          {/* FILA 2 */}
          <div className="form-grid">
            <div className="field-group">
              <label htmlFor="ref">
                <ClipboardList size={14} /> Referencia (Nº)
              </label>
              <input id="ref" name="ref" type="text"
                placeholder="Ej: 001, 002..."
                value={form.ref} onChange={handleChange} />
            </div>
            <div className="field-group">
              <label htmlFor="propiedad">
                <Home size={14} /> Propiedad <span className="req">*</span>
              </label>
              <input id="propiedad" name="propiedad" type="text"
                placeholder="Nombre del apartamento o propiedad..."
                value={form.propiedad} onChange={handleChange} required />
            </div>
          </div>

          {/* CLASIFICACIÓN */}
          <div className="field-group full-width">
            <label htmlFor="clasificacion">
              <ClipboardList size={14} /> Clasificación de la incidencia <span className="req">*</span>
            </label>
            <div className="select-wrap">
              <select id="clasificacion" name="clasificacion"
                value={form.clasificacion} onChange={handleChange} required
                className={form.clasificacion === "" ? "placeholder" : ""}
              >
                <option value="" disabled>— Selecciona una categoría —</option>
                {CLASIFICACIONES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown size={18} className="select-arrow" />
            </div>

            <AnimatePresence>
              {form.clasificacion === "Otro" && (
                <motion.div className="otro-wrap"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <input id="clasificacionOtro" name="clasificacionOtro" type="text"
                    placeholder="Describe el tipo de incidencia..."
                    value={form.clasificacionOtro} onChange={handleChange} autoFocus />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* DESCRIPCIÓN */}
          <div className="field-group full-width">
            <label htmlFor="descripcion">
              <MessageSquare size={14} /> Descripción de la incidencia <span className="req">*</span>
            </label>
            <textarea id="descripcion" name="descripcion" rows={4}
              placeholder="Describe detalladamente la incidencia..."
              value={form.descripcion} onChange={handleChange} required />
          </div>

          {/* SEPARADOR */}
          <div className="section-divider">
            <Wrench size={16} className="icon-accent" />
            <span>Datos de Resolución <small>(opcional)</small></span>
          </div>

          {/* FILA 3 */}
          <div className="form-grid">
            <div className="field-group">
              <label htmlFor="operario">
                <User size={14} /> Operario
              </label>
              <input id="operario" name="operario" type="text"
                placeholder="Nombre del operario..."
                value={form.operario} onChange={handleChange} />
            </div>
            <div className="field-group">
              <label htmlFor="costoManoObra">
                <DollarSign size={14} /> Costo mano de obra (€)
              </label>
              <input id="costoManoObra" name="costoManoObra" type="number"
                min="0" step="0.01" placeholder="0.00"
                value={form.costoManoObra} onChange={handleChange} />
            </div>
          </div>

          {/* ACCIÓN TOMADA */}
          <div className="field-group full-width">
            <label htmlFor="accionTomada">
              <ClipboardList size={14} /> Acción tomada
            </label>
            <textarea id="accionTomada" name="accionTomada" rows={3}
              placeholder="Describe la acción tomada para resolver la incidencia..."
              value={form.accionTomada} onChange={handleChange} />
          </div>

          {/* ESTADO */}
          <div className="field-group full-width">
            <label htmlFor="estado">
              <CheckCircle size={14} /> Estado
            </label>
            <div className="select-wrap">
              <select id="estado" name="estado"
                value={form.estado} onChange={handleChange}>
                {ESTADOS_INICIALES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={18} className="select-arrow" />
            </div>
          </div>

          {/* STATUS MSG */}
          <AnimatePresence>
            {status.msg && (
              <motion.div className={`status-msg ${status.type}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {status.type === "success" ? <CheckCircle size={16} />
                  : status.type === "error" ? <AlertCircle size={16} />
                  : <Loader2 size={16} className="spin" />}
                {status.msg}
              </motion.div>
            )}
          </AnimatePresence>

          {/* BOTONES */}
          <div className="form-actions">
            <button type="button" className="btn btn-secondary"
              onClick={() => { setForm(FORM_INICIAL); setStatus({ type: "", msg: "" }); }}>
              Limpiar
            </button>
            <button type="button" className="btn btn-backup" onClick={downloadBackup}>
              Respaldar Local
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading
                ? <><Loader2 size={18} className="spin" /> Enviando...</>
                : <><Send size={18} /> Enviar a Google Sheets</>}
            </button>
          </div>
        </form>
      </motion.div>

      <footer className="app-footer">
        Incidencias 2026 · Hoja: <strong>INCIDENCIA 2026</strong>
      </footer>
    </div>
  );
}
