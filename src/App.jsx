import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Send, CheckCircle, AlertCircle, ChevronDown,
  User, Home, Calendar, ClipboardList, Wrench, DollarSign,
  MessageSquare, PlusCircle, Loader2, Moon, Sun, Truck, Eraser, Pencil, FolderPlus
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

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz8Um6I2jVvrG-07Oz7KHwtWLB7NNn6uKbzIQXc-XAu55OgJUurN5gL51NC5mv8N8xs/exec";

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
  
  // Gestión de Facturas y Referencias
  const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear]   = useState(currentYear.toString());
  const [nextRef, setNextRef]             = useState("...");
  const [existingRefs, setExistingRefs]   = useState([]);
  const [loadingRefs, setLoadingRefs]     = useState(false);
  const [isUploading, setIsUploading]     = useState(false);
  const [uploadStatus, setUploadStatus]   = useState(null);
  const [previewUrl, setPreviewUrl]       = useState(null);
  const [previewType, setPreviewType]     = useState(null);
  // Nombre del archivo seleccionado para el campo REF
  const [selectedRefFileName, setSelectedRefFileName] = useState("");

  // Propiedades desde Google Sheet (sin Apps Script)
  const [propiedadesLocales, setPropiedadesLocales] = useState([]);
  const [loadingPropiedades, setLoadingPropiedades] = useState(false);

  useEffect(() => {
    const fetchPropiedades = async () => {
      setLoadingPropiedades(true);
      try {
        const url = "https://docs.google.com/spreadsheets/d/1Z1qYQ2ykQG2Kq1hO9K2PdjES_OvOR2d1yKPv7MdyAa4/gviz/tq?tqx=out:json&sheet=ALOJAMIENTOS%20ACTIVOS";
        const res = await fetch(url);
        const text = await res.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);
        
        const props = [];
        if (data && data.table && data.table.rows) {
          data.table.rows.forEach(row => {
            if (row.c && row.c[0] && row.c[0].v) {
              const propName = row.c[0].v;
              let ref = '';
              if (row.c[1]) {
                if (row.c[1].f) ref = row.c[1].f;
                else if (row.c[1].v) ref = String(row.c[1].v);
              }
              props.push({ name: propName, ref: ref });
            }
          });
        }
        setPropiedadesLocales(props);
      } catch (e) {
        console.error("Error cargando propiedades:", e);
      } finally {
        setLoadingPropiedades(false);
      }
    };
    fetchPropiedades();
  }, []);

  // Administración: Colores y Trimestres
  const [adminScan, setAdminScan]               = useState(null);
  const [adminError, setAdminError]             = useState(null);
  const [loadingAdmin, setLoadingAdmin]         = useState(false);
  const [selectedAdminYear, setSelectedAdminYear] = useState(currentYear.toString());
  const [colorAssignments, setColorAssignments] = useState({});
  const [creatingStructure, setCreatingStructure] = useState(false);
  const [createResult, setCreateResult]         = useState(null);

  // Selector Mensual de Facturas Drive
  const [monthFiles, setMonthFiles]             = useState([]);
  const [loadingMonthFiles, setLoadingMonthFiles] = useState(false);
  const [selectedAdminMonth, setSelectedAdminMonth] = useState(MONTHS[new Date().getMonth()]);

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

  useEffect(() => {
    if (activeTab === "historial")      fetchIncidencias();
    if (activeTab === "nuevo")         fetchNextRef(selectedMonth, selectedYear);
    if (activeTab === "administracion") fetchScanStructure(selectedAdminYear);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "nuevo") fetchNextRef(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear]);

  const fetchNextRef = async (month, year) => {
    setLoadingRefs(true);
    try {
      const params = month && year ? `&month=${month}&year=${year}` : '';
      const resNext = await fetch(`${GOOGLE_SCRIPT_URL}?action=getNextRef${params}`);
      const dataNext = await resNext.json();
      // FORZAR STRING para evitar notación científica
      if (dataNext.nextRef) setNextRef(String(dataNext.nextRef));

      const resAll = await fetch(`${GOOGLE_SCRIPT_URL}?action=getAllRefs${params}`);
      const dataAll = await resAll.json();
      if (Array.isArray(dataAll.refs)) {
        // Forzar ref como string en cada item
        setExistingRefs(dataAll.refs.map(item => ({ ...item, ref: String(item.ref) })));
      } else {
        setExistingRefs([]);
      }
    } catch (error) {
      console.error("Error al obtener referencias:", error);
      setExistingRefs([]);
    } finally {
      setLoadingRefs(false);
    }
  };

  const fetchScanStructure = async (year) => {
    setLoadingAdmin(true);
    setAdminError(null);
    try {
      const res  = await fetch(`${GOOGLE_SCRIPT_URL}?action=scanStructure&year=${year}`);
      const data = await res.json();
      if (data && data.error) {
        setAdminError(data.error);
        setAdminScan(null);
      } else if (data && data.structure && data.availability && data.colorPalette) {
        setAdminScan(data);
        setColorAssignments({});
      } else {
        // Respuesta inesperada — mostramos error amigable
        setAdminError('Respuesta inesperada de Drive. Verifica permisos y estructura de carpetas.');
        setAdminScan(null);
      }
    } catch (err) {
      console.error('Error escaneo Drive:', err);
      setAdminError('Error de conexión con Drive: ' + err.message);
      setAdminScan(null);
    } finally {
      setLoadingAdmin(false);
    }
  };

  const fetchMonthFiles = async (month, year) => {
    setLoadingMonthFiles(true);
    try {
      const res  = await fetch(`${GOOGLE_SCRIPT_URL}?action=getMonthFiles&month=${month}&year=${year}`);
      const data = await res.json();
      setMonthFiles(Array.isArray(data.files) ? data.files : []);
    } catch (err) {
      console.error('Error al obtener archivos del mes:', err);
    } finally {
      setLoadingMonthFiles(false);
    }
  };

  const handleCreateStructure = async () => {
    if (Object.keys(colorAssignments).length === 0) return;
    setCreatingStructure(true);
    setCreateResult(null);
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ action: 'createYearStructure', year: selectedAdminYear, colorAssignments })
      });
      setCreateResult({ success: true, msg: `✅ Estructura ${selectedAdminYear} creada en Drive (con subcarpetas de meses).` });
      setTimeout(() => fetchScanStructure(selectedAdminYear), 2500);
    } catch (err) {
      setCreateResult({ success: false, msg: '❌ Error: ' + err.message });
    } finally {
      setCreatingStructure(false);
    }
  };

  const [ensuringMonths, setEnsuringMonths] = useState(false);
  const [ensureResult, setEnsureResult]     = useState(null);

  const handleEnsureMonths = async () => {
    setEnsuringMonths(true);
    setEnsureResult(null);
    try {
      const res  = await fetch(`${GOOGLE_SCRIPT_URL}?action=ensureMonths&year=${selectedAdminYear}`);
      const data = await res.json();
      if (data.success) {
        const summary = data.results.map(r => `${r.quarter}: ${r.status}`).join(' | ');
        setEnsureResult({ success: true, msg: `✅ Meses verificados: ${summary}` });
      } else {
        setEnsureResult({ success: false, msg: '⚠️ ' + JSON.stringify(data) });
      }
    } catch (err) {
      setEnsureResult({ success: false, msg: '❌ Error: ' + err.message });
    } finally {
      setEnsuringMonths(false);
    }
  };

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
    setPreviewUrl(null);
    setPreviewType(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Crear URL temporal para la vista previa
    const fileUrl = URL.createObjectURL(file);
    setPreviewUrl(fileUrl);
    setPreviewType(file.type);

    setIsUploading(true);
    setUploadStatus({ type: 'info', msg: 'Subiendo factura y generando referencia...' });

    try {
      const currentNextRef = String(nextRef); // SIEMPRE STRING
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf';
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const finalFileName = `${baseName} ${currentNextRef}.${ext}`;

      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const base64 = event.target.result;
          const payload = {
            action: "uploadInvoice",
            fileBase64: base64,
            fileName: file.name,
            refNumber: String(currentNextRef), // FORZAR STRING para evitar float
            month: selectedMonth,
            year:  selectedYear
          };

          // POST a Apps Script con no-cors para evitar el bloqueo del navegador
          await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(payload)
          });

          // Asumimos éxito (no-cors no nos deja leer la respuesta json)
          setForm(prev => ({ ...prev, ref: currentNextRef }));
          setSelectedRefFileName(finalFileName);
          
          // Recargamos las referencias desde Drive
          await fetchNextRef(selectedMonth, selectedYear);

          setUploadStatus({ type: 'success', msg: `✅ Factura subida: "${finalFileName}"` });
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
        } catch (postError) {
          setUploadStatus({ type: 'error', msg: 'Error de red al subir la factura.' });
        } finally {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setUploadStatus({ type: 'error', msg: 'Error al procesar: ' + error.message });
      setIsUploading(false);
    }
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
      "REF. FACTURA":                   form.ref,
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
        <button
          className={`tab-btn ${activeTab === "administracion" ? "active" : ""}`}
          onClick={() => setActiveTab("administracion")}
        >
          <Wrench size={18} /> Administración
        </button>
      </nav>

      {/* ── CONTENIDO DINÁMICO ─────────────────────── */}
      <AnimatePresence mode="wait">

        {/* ── TAB: NUEVO REPORTE ── */}
        {activeTab === "nuevo" && (
          <motion.div
            key="form"
            className="glass-card form-card"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <div className="form-section-title">
              {isEditing ? <Pencil size={20} className="icon-accent" /> : <PlusCircle size={20} className="icon-accent" />}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>{isEditing ? "Modificando Incidencia Existente" : "Registrar Nueva Incidencia"}</span>
                {!isEditing && (
                  <span className="ref-counter-badge">
                    Próxima Ref: <strong>{nextRef}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* ── SECCIÓN DE SUBIDA DE FACTURA ── */}
            {!isEditing && (
              <div className="upload-zone animate-fade-in">
                <div className="upload-header">
                  <Truck size={18} />
                  <span>Carga de Factura (Auto-Ref)</span>
                </div>
                <div className="upload-content">
                  <label htmlFor="invoice-upload" className={`upload-label ${isUploading ? 'uploading' : ''}`}>
                    {isUploading ? <Loader2 size={24} className="spin" /> : <PlusCircle size={24} />}
                    <div className="upload-text">
                      <p>{isUploading ? "Procesando..." : "Haz clic o arrastra la factura"}</p>
                      <small>Se asignará la referencia {nextRef} automáticamente</small>
                    </div>
                    <input 
                      id="invoice-upload" 
                      type="file" 
                      accept=".pdf,image/*" 
                      onChange={handleFileUpload} 
                      disabled={isUploading}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {uploadStatus && (
                    <div className={`upload-status-mini ${uploadStatus.type}`}>
                      {uploadStatus.msg}
                    </div>
                  )}
                </div>

                {/* ── VISTA PREVIA ── */}
                {previewUrl && (
                  <div className="preview-container animate-fade-in">
                    <div className="preview-header">
                      <span>Vista Previa del Documento</span>
                      <button type="button" onClick={() => { setPreviewUrl(null); setPreviewType(null); }} className="close-preview">
                        ✕
                      </button>
                    </div>
                    {previewType && previewType.startsWith('image/') ? (
                      <img src={previewUrl} alt="Vista previa de factura" className="preview-media" />
                    ) : (
                      <iframe src={previewUrl} title="Vista previa PDF" className="preview-media pdf-preview" />
                    )}
                  </div>
                )}
              </div>
            )}

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
                <div className="field-group ref-period-group">
                  <label>
                    <ClipboardList size={14} /> Ref. (Nº) — Buscar por periodo
                  </label>

                  {/* Selector de mes / año */}
                  <div className="period-picker">
                    <div className="select-wrap">
                      <select
                        id="refMonth"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                      >
                        {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <ChevronDown size={16} className="select-arrow" />
                    </div>
                    <div className="select-wrap">
                      <select
                        id="refYear"
                        value={selectedYear}
                        onChange={e => setSelectedYear(e.target.value)}
                      >
                        {[currentYear-1, currentYear, currentYear+1].map(y => (
                          <option key={y} value={y.toString()}>{y}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="select-arrow" />
                    </div>
                    {loadingRefs && <Loader2 size={16} className="spin" style={{color:'var(--primary)'}} />}
                  </div>

                  {/* Desplegable de referencias — muestra el nombre original del archivo */}
                  <div className="select-wrap">
                    <select
                      id="ref"
                      name="ref"
                      value={form.ref}
                      onChange={e => {
                        const val = e.target.value;
                        setForm(prev => ({ ...prev, ref: val }));
                        // Guardar el nombre del archivo asociado a la ref
                        const found = existingRefs.find(r => r.ref === val);
                        setSelectedRefFileName(found ? found.fullName : "");
                      }}
                    >
                      <option value="">— Seleccionar referencia —</option>
                      {nextRef !== "..." && (
                        <option value={nextRef}>⭐ Nueva: {nextRef} (siguiente disponible)</option>
                      )}
                      {existingRefs.length > 0 && (
                        <optgroup label={`── ${selectedMonth} ${selectedYear} en Drive (${existingRefs.length}) ──`}>
                          {existingRefs.map(item => (
                            <option key={item.fileId || item.ref} value={item.ref}>
                              {/* Mostramos el nombre completo del archivo tal como está en Drive */}
                              {item.fullName}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {!loadingRefs && existingRefs.length === 0 && (
                        <option disabled>Sin archivos en este periodo</option>
                      )}
                    </select>
                    <ChevronDown size={18} className="select-arrow" />
                  </div>
                  {selectedRefFileName && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      📄 Archivo: <strong>{selectedRefFileName}</strong>
                    </p>
                  )}
                </div>
                <div className="field-group">
                  <label htmlFor="propiedad">
                    <Home size={14} /> Propiedad <span className="req">*</span>
                  </label>
                  <div className="select-wrap">
                    <select
                      id="propiedad"
                      name="propiedad"
                      value={form.propiedad}
                      onChange={handleChange}
                      required
                    >
                      <option value="">— Seleccionar Propiedad —</option>
                      {loadingPropiedades ? (
                        <option value="" disabled>Cargando propiedades...</option>
                      ) : (
                        propiedadesLocales.map((p, i) => (
                          <option key={i} value={p.name}>
                            {p.ref ? `[${p.ref}] ` : ''}{p.name}
                          </option>
                        ))
                      )}
                    </select>
                    <ChevronDown size={18} className="select-arrow" />
                  </div>
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
        )}

        {/* ── TAB: HISTORIAL ── */}
        {activeTab === "historial" && (
          <motion.div key="history" className="history-list" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
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

        {/* ── TAB: ADMINISTRACIÓN ── */}
        {activeTab === "administracion" && (
          <motion.div key="admin" className="glass-card form-card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

          {/* -- Escaneo de estructura -- */}
          <div className="form-section-title">
            <Wrench size={20} className="icon-accent" />
            <span>Administración de Estructura Drive por Colores</span>
          </div>

          <div className="admin-toolbar">
            <div className="select-wrap" style={{ maxWidth: 140 }}>
              <select value={selectedAdminYear} onChange={e => { setSelectedAdminYear(e.target.value); setAdminScan(null); setMonthFiles([]); }}>
                {[currentYear-1, currentYear, currentYear+1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={16} className="select-arrow" />
            </div>
            <button className="btn btn-secondary" onClick={() => fetchScanStructure(selectedAdminYear)} disabled={loadingAdmin}>
              {loadingAdmin ? <Loader2 size={16} className="spin" /> : <Wrench size={16} />}
              Escanear Drive
            </button>
          </div>

          {/* Error de escaneo */}
          {adminError && (
            <div className="status-msg error" style={{ margin: '1rem 0' }}>
              ⚠️ {adminError}
            </div>
          )}

          {/* Grid de disponibilidad de colores */}
          {adminScan && !adminError && (
            <div className="admin-grid-wrap">
              <h3 className="admin-section-title">Disponibilidad de Colores — {adminScan.year}</h3>
              <div className="color-grid">
                <div className="color-grid-header">Color</div>
                {["Q1","Q2","Q3","Q4"].map(q => (
                  <div key={q} className="color-grid-header">{["Ene-Feb-Mar","Abr-May-Jun","Jul-Ago-Sep","Oct-Nov-Dic"][["Q1","Q2","Q3","Q4"].indexOf(q)]}</div>
                ))}
                {adminScan.colorPalette.map(color => (
                  <React.Fragment key={color.id}>
                    <div className="color-cell color-label-cell">
                      <span className="color-dot" style={{ background: color.hex }}></span>
                      {color.label}
                    </div>
                    {["Q1","Q2","Q3","Q4"].map(q => {
                      const used = adminScan.availability[q].used.includes(color.id);
                      const folderInfo = adminScan.structure[q].find(f => f.matchesYear && f.color === color.id);
                      return (
                        <div key={q} className={`color-cell ${used ? 'cell-used' : 'cell-free'}`}>
                          {used ? (
                            <span title={folderInfo?.name || 'Ocupado'}>✓ Ocupado</span>
                          ) : (
                            <>
                              <span>— Libre</span>
                              <input
                                type="checkbox"
                                className="cell-checkbox"
                                checked={colorAssignments[q] === color.id}
                                onChange={e => setColorAssignments(prev => e.target.checked ? { ...prev, [q]: color.id } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== q || prev[k] !== color.id)))}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>

              {Object.keys(colorAssignments).length > 0 && (
                <div className="admin-create-bar">
                  <p>Crear carpetas seleccionadas para <strong>{selectedAdminYear}</strong>:</p>
                  {["Q1","Q2","Q3","Q4"].filter(q => colorAssignments[q]).map(q => (
                    <span key={q} className="create-badge">
                      <span className="color-dot" style={{ background: adminScan.colorPalette.find(c=>c.id===colorAssignments[q])?.hex }}></span>
                      {["Q1 → Ene-Mar","Q2 → Abr-Jun","Q3 → Jul-Sep","Q4 → Oct-Dic"][["Q1","Q2","Q3","Q4"].indexOf(q)]}
                    </span>
                  ))}
                  <button className="btn btn-primary" onClick={handleCreateStructure} disabled={creatingStructure}>
                    {creatingStructure ? <Loader2 size={16} className="spin" /> : <PlusCircle size={16} />}
                    Crear Estructura en Drive
                  </button>
                  {createResult && (
                    <span className={`upload-status-mini ${createResult.success ? 'success' : 'error'}`}>{createResult.msg}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── BARRA: GARANTIZAR SUBCARPETAS DE MES ── */}
          <div className="form-section-title" style={{ marginTop: '2rem' }}>
            <FolderPlus size={20} className="icon-accent" />
            <span>Verificar Subcarpetas de Meses</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
            Crea automáticamente las subcarpetas de cada mes dentro de los trimestres del año seleccionado.
            Úsalo si las carpetas trimestrales ya existen pero les faltan los meses.
          </p>
          <div className="admin-toolbar">
            <button className="btn btn-secondary" onClick={handleEnsureMonths} disabled={ensuringMonths}>
              {ensuringMonths ? <Loader2 size={16} className="spin" /> : <FolderPlus size={16} />}
              Crear Meses en Trimestres ({selectedAdminYear})
            </button>
          </div>
          {ensureResult && (
            <div className={`status-msg ${ensureResult.success ? 'success' : 'error'}`} style={{ marginTop: '0.5rem' }}>
              {ensureResult.msg}
            </div>
          )}

          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
