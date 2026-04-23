import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Send, CheckCircle, AlertCircle, ChevronDown,
  User, Home, Calendar, ClipboardList, Wrench, DollarSign,
  MessageSquare, PlusCircle, Loader2, Moon, Sun, Truck, Eraser, Pencil
} from 'lucide-react';
// ─── Opciones del desplegable (igual que en el Excel) ──────────────────────────
const CLASIFICACIONES = [
  "MOVILIARIO",
  "INSTALACIONES",
  "MANTENIMIENTO",
  "ELECTRODOMESTICO",
  "MENAJE",
  "MALA GESTION",
  "OTRO",
];

const ESTADOS_INICIALES = ["PENDIENTE", "RESUELTA"];

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwj2RlyGw1s_VyHD60mnKd3cmyePsSZamv0qgb8uZT2lsPrjt5trB0UBaYqbLSjvvsb/exec";

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
  proveedor: "",
  costoManoObra: "",
  accionTomada: "",
  planAccion: "",
  estado: "PENDIENTE",
  rowIndex: null,
};

// Auxiliares
const formatearFecha = (fechaStr) => {
  if (!fechaStr) return "—";
  try {
    const fecha = new Date(fechaStr);
    if (isNaN(fecha.getTime())) return fechaStr; // Retornar tal cual si falla el parseo
    return new Intl.DateTimeFormat('es-ES', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric' 
    }).format(fecha);
  } catch (e) {
    return fechaStr;
  }
};

const normalizarFechaParaInput = (fechaRaw) => {
  if (!fechaRaw) return new Date().toISOString().split("T")[0];
  try {
    const d = new Date(fechaRaw);
    if (isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
    
    // Usar componentes locales para evitar desfases de zona horaria
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return new Date().toISOString().split("T")[0];
  }
};

// ─── Componente principal ──────────────────────────────────────────────────────
export default function App() {
  const [form, setForm]               = useState(FORM_INICIAL);
  const [loading, setLoading]       = useState(false);
  const [status, setStatus]         = useState({ type: "", msg: "" });
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Pestañas e Historial
  const [activeTab, setActiveTab] = useState("nuevo"); 
  const [incidencias, setIncidencias] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Modo Edición (Visual)
  const [isEditing, setIsEditing] = useState(false);

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

  // Cargar historial al cambiar a la pestaña
  useEffect(() => {
    if (activeTab === "historial") {
      fetchIncidencias();
    }
    // Si cambiamos a la pestaña de nuevo sin venir de un botón de edit, reseteamos modo edición
    if (activeTab === "nuevo" && !isEditing) {
      // Opcional: setForm(FORM_INICIAL); 
    }
  }, [activeTab]);

  const fetchIncidencias = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=read`);
      const data = await response.json();
      if (Array.isArray(data)) {
        const sortedData = data.sort((a, b) => {
          const dateA = new Date(a["FECHA"] || a["FECHA REPORTE INCIDENCIA"]);
          const dateB = new Date(b["FECHA"] || b["FECHA REPORTE INCIDENCIA"]);
          return dateB - dateA;
        });
        setIncidencias(sortedData); 
      }
    } catch (error) {
      console.error("Error al cargar historial:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleEdit = (inc) => {
    // Mapear campos de Excel a campos de Formulario
    const dataToEdit = {
      responsable: inc["RESPONSABLE DEL REPORTE"] || "",
      fecha:       normalizarFechaParaInput(inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"]),
      ref:         inc["ref"] || "",
      propiedad:   inc["PROPIEDAD"] || "",
      clasificacion: CLASIFICACIONES.includes(inc["CLASIFICACION DE LA INCIDENCIA"]) 
                     ? inc["CLASIFICACION DE LA INCIDENCIA"] 
                     : "OTRO",
      clasificacionOtro: CLASIFICACIONES.includes(inc["CLASIFICACION DE LA INCIDENCIA"])
                         ? ""
                         : inc["CLASIFICACION DE LA INCIDENCIA"] || "",
      descripcion: inc["DESCRIPCION DE LA INCIDENCIA"] || "",
      operario:    inc["OPERARIO"] || "",
      proveedor:   inc["PROVEEDOR"] || "",
      costoManoObra: inc["costo mano obra"] || "",
      accionTomada: inc["ACCION TOMADA"] || "",
      planAccion:   inc["PLAN DE ACCION"] || "",
      estado:       inc["ESTADO"] || "PENDIENTE",
      rowIndex:     inc.rowIndex,
    };

    setForm(dataToEdit);
    setIsEditing(true);
    setActiveTab("nuevo");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setForm(FORM_INICIAL);
    setIsEditing(false);
    setStatus({ type: "", msg: "" });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const clasificacionFinal =
    form.clasificacion === "OTRO" ? form.clasificacionOtro : form.clasificacion;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.responsable || !form.propiedad || !form.clasificacion || !form.descripcion) {
      setStatus({ type: "error", msg: "Por favor, rellena los campos obligatorios (*)." });
      return;
    }

    setLoading(true);
    setStatus({ type: "info", msg: isEditing ? "Guardando cambios..." : "Enviando incidencia..." });

    const payload = {
      "ref":                            form.ref,
      "PROPIEDAD":                      form.propiedad,
      "CLASIFICACION DE LA INCIDENCIA": clasificacionFinal,
      "DESCRIPCION DE LA INCIDENCIA":   form.descripcion,
      "OPERARIO":                       form.operario,
      "PROVEEDOR":                      form.proveedor,
      "ESTADO":                         form.estado,
      "ACCION TOMADA":                  form.accionTomada,
      "PLAN DE ACCION":                 form.planAccion,
      "FECHA":                          form.fecha,
      "FECHA REPORTE INCIDENCIA":       form.fecha,
      "costo mano obra":                form.costoManoObra,
      "RESPONSABLE DEL REPORTE":        form.responsable,
      "rowIndex":                       form.rowIndex,
    };

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        body: JSON.stringify(payload),
      });

      setStatus({ 
        type: "success", 
        msg: isEditing ? "¡Incidencia actualizada correctamente!" : "¡Tu reporte ha sido procesado correctamente!" 
      });
      setShowSuccess(true);
      resetForm();
      setTimeout(() => setShowSuccess(false), 4000);

    } catch (error) {
      setStatus({ type: "error", msg: "Error al procesar: " + error.message });
    } finally {
      setLoading(false);
    }
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
            {isEditing ? "Cambios guardados con éxito" : "¡Incidencia guardada!"}
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
            <p className="subtitle">Gestión y seguimiento administrativo</p>
          </div>
        </div>

        {/* Botón toggle tema */}
        <button
          className="theme-toggle"
          onClick={() => setDarkMode((d) => !d)}
          aria-label="Cambiar tema"
        >
          <AnimatePresence mode="wait" initial={false}>
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </AnimatePresence>
          <span className="theme-label">{darkMode ? "Claro" : "Oscuro"}</span>
        </button>
      </header>

      {/* ── TABS NAVEGACIÓN ────────────────────────── */}
      <nav className="tabs-container animate-fade-in" style={{ animationDelay: '0.1s' }}>
        <button 
          className={`tab-btn ${activeTab === "nuevo" ? "active" : ""}`}
          onClick={() => { setActiveTab("nuevo"); if(!isEditing) resetForm(); }}
        >
          {isEditing ? <Pencil size={18} /> : <PlusCircle size={18} />} 
          {isEditing ? "Editando" : "Nuevo Reporte"}
        </button>
        <button 
          className={`tab-btn ${activeTab === "historial" ? "active" : ""}`}
          onClick={() => setActiveTab("historial")}
        >
          <ClipboardList size={18} /> Ver Historial
        </button>
      </nav>

      {/* ── CONTENIDO DINÁMICO ─────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === "nuevo" ? (
          <motion.div
            key="form"
            className="glass-card form-card"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="form-section-title">
              {isEditing ? <Pencil size={20} className="icon-accent" /> : <PlusCircle size={20} className="icon-accent" />}
              <span>{isEditing ? "Modificando Incidencia Existente" : "Registrar Nueva Incidencia"}</span>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="responsable">
                    <User size={14} /> Responsable <span className="req">*</span>
                  </label>
                  <input id="responsable" name="responsable" type="text"
                    value={form.responsable} onChange={handleChange} required />
                </div>
                <div className="field-group">
                  <label htmlFor="fecha">
                    <Calendar size={14} /> Fecha <span className="req">*</span>
                  </label>
                  <input id="fecha" name="fecha" type="date"
                    value={form.fecha} onChange={handleChange} required />
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="ref">
                    <ClipboardList size={14} /> Ref. (Nº)
                  </label>
                  <input id="ref" name="ref" type="text"
                    value={form.ref} onChange={handleChange} />
                </div>
                <div className="field-group">
                  <label htmlFor="propiedad">
                    <Home size={14} /> Propiedad <span className="req">*</span>
                  </label>
                  <input id="propiedad" name="propiedad" type="text"
                    value={form.propiedad} onChange={handleChange} required />
                </div>
              </div>

              <div className="field-group full-width">
                <label htmlFor="clasificacion">
                  <ClipboardList size={14} /> Clasificación <span className="req">*</span>
                </label>
                <div className="select-wrap">
                  <select id="clasificacion" name="clasificacion"
                    value={form.clasificacion} onChange={handleChange} required
                  >
                    <option value="" disabled>— Selecciona —</option>
                    {CLASIFICACIONES.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                  <ChevronDown size={18} className="select-arrow" />
                </div>

                <AnimatePresence>
                  {form.clasificacion === "OTRO" && (
                    <motion.div className="otro-wrap" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                      <input id="clasificacionOtro" name="clasificacionOtro" type="text"
                        value={form.clasificacionOtro} onChange={handleChange} autoFocus />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="field-group full-width">
                <label htmlFor="descripcion">
                  <MessageSquare size={14} /> Descripción <span className="req">*</span>
                </label>
                <textarea id="descripcion" name="descripcion" rows={4}
                  value={form.descripcion} onChange={handleChange} required />
              </div>

              <div className="section-divider">
                <Wrench size={16} className="icon-accent" />
                <span>Gestión y Resolución <small>(Opcional)</small></span>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="operario">
                    <User size={14} /> Operario
                  </label>
                  <input id="operario" name="operario" type="text"
                    value={form.operario} onChange={handleChange} />
                </div>
                <div className="field-group">
                  <label htmlFor="proveedor">
                    <Truck size={14} /> Proveedor
                  </label>
                  <input id="proveedor" name="proveedor" type="text"
                    value={form.proveedor} onChange={handleChange} />
                </div>
              </div>

              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="costoManoObra">
                    <DollarSign size={14} /> Mano de Obra (€)
                  </label>
                  <input id="costoManoObra" name="costoManoObra" type="number"
                    step="0.01" value={form.costoManoObra} onChange={handleChange} />
                </div>
                <div className="field-group">
                  <label htmlFor="estado">
                    <CheckCircle size={14} /> Estado
                  </label>
                  <div className="select-wrap">
                    <select id="estado" name="estado" value={form.estado} onChange={handleChange}>
                      {ESTADOS_INICIALES.map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                    <ChevronDown size={18} className="select-arrow" />
                  </div>
                </div>
              </div>

              <div className="field-group full-width">
                <label htmlFor="accionTomada">
                  <ClipboardList size={14} /> Acción tomada
                </label>
                <textarea id="accionTomada" name="accionTomada" rows={2}
                  value={form.accionTomada} onChange={handleChange} />
              </div>

              <div className="field-group full-width">
                <label htmlFor="planAccion">
                  <Wrench size={14} /> Plan de acción futuro
                </label>
                <textarea id="planAccion" name="planAccion" rows={3}
                  value={form.planAccion} onChange={handleChange} />
              </div>

              {status.msg && <div className={`status-msg ${status.type}`}>{status.msg}</div>}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  <Eraser size={18} /> Cancelar / Limpiar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <Loader2 size={18} className="spin" /> : <><Send size={18} /> {isEditing ? "Guardar Cambios" : "Enviar Incidencia"}</>}
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          /* HISTORIAL */
          <motion.div key="history" className="history-list" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            {loadingHistory ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                <Loader2 size={40} className="spin icon-accent" />
                <p>Cargando historial...</p>
              </div>
            ) : incidencias.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '4rem' }}>
                <AlertCircle size={40} className="icon-accent" style={{ opacity: 0.5 }} />
                <p>No hay registros.</p>
              </div>
            ) : (
              incidencias.map((inc, i) => (
                <div key={i} className="glass-card history-card animate-fade-in">
                  <div className="card-header">
                    <div className="card-title-wrap">
                      <h3>{inc["PROPIEDAD"] || "Sin Nombre"}</h3>
                      <p className="card-date">{formatearFecha(inc["FECHA"] || inc["FECHA REPORTE INCIDENCIA"])}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                      <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={() => handleEdit(inc)}>
                        <Pencil size={14} /> Editar
                      </button>
                      <span className={`badge-status ${(inc["ESTADO"] || "pendiente").toLowerCase()}`}>
                        {inc["ESTADO"] || "PENDIENTE"}
                      </span>
                    </div>
                  </div>

                  <div className="card-grid">
                    <div className="data-item">
                      <span className="data-label">Responsable</span>
                      <span className="data-value">{inc["RESPONSABLE DEL REPORTE"]}</span>
                    </div>
                    <div className="data-item">
                      <span className="data-label">Categoría</span>
                      <span className="data-value">{inc["CLASIFICACION DE LA INCIDENCIA"]}</span>
                    </div>
                    <div className="data-item full-width-item">
                      <span className="data-label">Descripción</span>
                      <div className="description-box">{inc["DESCRIPCION DE LA INCIDENCIA"]}</div>
                    </div>
                    {inc["PLAN DE ACCION"] && (
                      <div className="data-item full-width-item">
                        <span className="data-label">Plan de Acción (Próximos pasos)</span>
                        <span className="data-value" style={{ color: '#ff4d4d' }}>{inc["PLAN DE ACCION"]}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
