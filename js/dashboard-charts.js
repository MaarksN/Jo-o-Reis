/**
 * AtlasGR • Dashboard Visualizer using Recharts & React
 * Interactive SDR activity metrics, Pomodoro focus analytics, and pipeline conversion trends.
 */

(function () {
  function initDashboardComponent() {
    const rootEl = document.getElementById('rechartsDashboardRoot');
    if (!rootEl) return;

    const React = window.React;
    const ReactDOM = window.ReactDOM;
    const Recharts = window.Recharts;

    if (!React || !ReactDOM || !Recharts) {
      rootEl.innerHTML = '<div class="empty">Carregando bibliotecas Recharts...</div>';
      return;
    }

    const {
      ResponsiveContainer,
      ComposedChart,
      BarChart,
      Bar,
      LineChart,
      Line,
      AreaChart,
      Area,
      PieChart,
      Pie,
      Cell,
      XAxis,
      YAxis,
      CartesianGrid,
      Tooltip,
      Legend
    } = Recharts;

    const COLORS = {
      orange: '#ff5618',
      orangeLight: '#ff8008',
      gold: '#ffc500',
      green: '#167958',
      greenLight: '#00b87c',
      blue: '#2f6fed',
      red: '#b93d3d',
      purple: '#7356c5',
      muted: '#776d67'
    };

    const OUTCOME_COLORS = [
      '#167958', // Reunião Agendada
      '#00b87c', // Oportunidade
      '#2f6fed', // Contato Realizado
      '#ff8008', // Sem resposta
      '#ffc500', // Retorno programado
      '#b93d3d', // Desqualificado (sem fit)
      '#7356c5', // Revisão gestão
      '#999999'  // Outros
    ];

    function SDRDashboard() {
      const [filterPeriod, setFilterPeriod] = React.useState('all'); // 'today', '7d', '30d', 'all'
      const [refreshKey, setRefreshKey] = React.useState(0);

      // Load data from global state & storageManager
      const progress = window.PROG || { done: {}, history: [] };
      const pomHistory = (window.storageManager ? window.storageManager.loadPomodoroHistory() : []) || [];
      const decisions = (window.DATA && window.DATA.decisoes) || [];

      // Filter history based on period
      const filteredHistory = React.useMemo(() => {
        const hist = progress.history || [];
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        if (filterPeriod === 'today') {
          return hist.filter(h => new Date(h.at).getTime() >= startOfDay);
        }
        if (filterPeriod === '7d') {
          const past7 = now.getTime() - 7 * 24 * 60 * 60 * 1000;
          return hist.filter(h => new Date(h.at).getTime() >= past7);
        }
        if (filterPeriod === '30d') {
          const past30 = now.getTime() - 30 * 24 * 60 * 60 * 1000;
          return hist.filter(h => new Date(h.at).getTime() >= past30);
        }
        return hist;
      }, [progress.history, filterPeriod, refreshKey]);

      // KPIs calculation
      const kpis = React.useMemo(() => {
        const total = filteredHistory.length;
        const reunioes = filteredHistory.filter(h => h.outcome === 'reuniao_agendada' || h.outcome === 'reuniao_realizada').length;
        const oportunidades = filteredHistory.filter(h => h.outcome === 'oportunidade').length;
        const desqualificados = filteredHistory.filter(h => h.outcome === 'sem_fit' || h.outcome === 'dados_invalidos').length;
        const noBitrix = filteredHistory.filter(h => h.mode === 'BITRIX').length;
        
        // Pomodoro focus total minutes
        const totalFocusMin = pomHistory.reduce((acc, p) => acc + (p.durationMinutes || 25), 0);
        const pomCycles = pomHistory.length;

        // Average duration calculation
        const durations = filteredHistory.filter(h => h.durationSeconds > 0).map(h => h.durationSeconds);
        const avgSecs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
        const avgFormatted = avgSecs > 0 ? `${Math.floor(avgSecs / 60)}m ${avgSecs % 60}s` : '2m 30s (est.)';

        return {
          total,
          reunioes,
          oportunidades,
          taxaConversao: total > 0 ? Math.round(((reunioes + oportunidades) / total) * 100) : 0,
          taxaDesq: total > 0 ? Math.round((desqualificados / total) * 100) : 0,
          noBitrix,
          totalFocusMin,
          pomCycles,
          avgFormatted
        };
      }, [filteredHistory, pomHistory]);

      // Daily Activity Data for ComposedChart
      const dailyData = React.useMemo(() => {
        const dayMap = {};

        // Seed with last 7 days if empty
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const key = d.toISOString().slice(5, 10); // MM-DD
          dayMap[key] = { dia: key, tratados: 0, contatos: 0, reunioes: 0, oportunidades: 0, desqualificados: 0, minutosFoco: 0 };
        }

        // Aggregate treatment history
        filteredHistory.forEach(h => {
          const dateStr = (h.at || '').slice(5, 10);
          if (!dayMap[dateStr]) {
            dayMap[dateStr] = { dia: dateStr, tratados: 0, contatos: 0, reunioes: 0, oportunidades: 0, desqualificados: 0, minutosFoco: 0 };
          }
          dayMap[dateStr].tratados++;
          if (h.outcome === 'contato') dayMap[dateStr].contatos++;
          if (h.outcome === 'reuniao_agendada' || h.outcome === 'reuniao_realizada') dayMap[dateStr].reunioes++;
          if (h.outcome === 'oportunidade') dayMap[dateStr].oportunidades++;
          if (h.outcome === 'sem_fit' || h.outcome === 'dados_invalidos') dayMap[dateStr].desqualificados++;
        });

        // Aggregate pomodoro history
        pomHistory.forEach(p => {
          const dateStr = (p.date || '').slice(5, 10);
          if (dayMap[dateStr]) {
            dayMap[dateStr].minutosFoco += (p.durationMinutes || 25);
          }
        });

        return Object.values(dayMap);
      }, [filteredHistory, pomHistory]);

      // Outcomes Pie Data
      const outcomePieData = React.useMemo(() => {
        const counts = {};
        const labelMap = {
          contato: 'Contato Realizado',
          reuniao_agendada: 'Reunião Agendada',
          reuniao_realizada: 'Reunião Realizada',
          oportunidade: 'Oportunidade Criada',
          retorno: 'Retorno Programado',
          sem_resposta: 'Sem Resposta',
          sem_fit: 'Sem Fit / Desqualificado',
          dados_invalidos: 'Dados Inválidos',
          revisao: 'Revisão Gestão',
          gestao_decidido: 'Decidido Gestão'
        };

        filteredHistory.forEach(h => {
          const k = labelMap[h.outcome] || h.outcome || 'Outros';
          counts[k] = (counts[k] || 0) + 1;
        });

        const arr = Object.entries(counts).map(([name, value]) => ({ name, value }));
        if (!arr.length) {
          return [{ name: 'Aguardando tratamentos', value: 1 }];
        }
        return arr;
      }, [filteredHistory]);

      // Funnel Stage Distribution Bar Data
      const funnelStageData = React.useMemo(() => {
        const counts = {};
        decisions.forEach(d => {
          if (window.effectiveActive ? window.effectiveActive(d) : true) {
            const st = d.STATUS || 'Outro';
            counts[st] = (counts[st] || 0) + 1;
          }
        });
        return Object.entries(counts)
          .map(([stage, total]) => ({ stage, total }))
          .sort((a, b) => b.total - a.total);
      }, [decisions]);

      return React.createElement(
        'div',
        { className: 'recharts-dash-container' },
        // Header & Period Filter Controls
        React.createElement(
          'div',
          { className: 'dash-header-controls' },
          React.createElement('h2', { style: { margin: 0, fontSize: '18px', fontWeight: '850', color: 'var(--ink)' } }, '📊 Métricas de Atividade SDR & Sessões Pomodoro'),
          React.createElement(
            'div',
            { className: 'dash-period-filters' },
            React.createElement(
              'button',
              {
                className: `tab ${filterPeriod === 'today' ? 'active' : ''}`,
                onClick: () => setFilterPeriod('today')
              },
              'Hoje'
            ),
            React.createElement(
              'button',
              {
                className: `tab ${filterPeriod === '7d' ? 'active' : ''}`,
                onClick: () => setFilterPeriod('7d')
              },
              'Últimos 7 dias'
            ),
            React.createElement(
              'button',
              {
                className: `tab ${filterPeriod === '30d' ? 'active' : ''}`,
                onClick: () => setFilterPeriod('30d')
              },
              'Últimos 30 dias'
            ),
            React.createElement(
              'button',
              {
                className: `tab ${filterPeriod === 'all' ? 'active' : ''}`,
                onClick: () => setFilterPeriod('all')
              },
              'Todo o Histórico'
            )
          )
        ),

        // KPI Summary Cards
        React.createElement(
          'div',
          { className: 'kpis', style: { margin: '14px 0 20px', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' } },
          React.createElement(
            'div',
            { className: 'card kpi' },
            React.createElement('b', { style: { color: COLORS.orange } }, kpis.total),
            React.createElement('span', null, 'LEADS TRATADOS')
          ),
          React.createElement(
            'div',
            { className: 'card kpi' },
            React.createElement('b', { style: { color: COLORS.green } }, `${kpis.taxaConversao}%`),
            React.createElement('span', null, 'CONVERSÃO / REUNIÃO')
          ),
          React.createElement(
            'div',
            { className: 'card kpi' },
            React.createElement('b', { style: { color: COLORS.blue } }, `${kpis.totalFocusMin} min`),
            React.createElement('span', null, 'TEMPO TOTAL EM FOCO')
          ),
          React.createElement(
            'div',
            { className: 'card kpi' },
            React.createElement('b', { style: { color: COLORS.purple } }, kpis.pomCycles),
            React.createElement('span', null, 'CICLOS POMODORO')
          ),
          React.createElement(
            'div',
            { className: 'card kpi' },
            React.createElement('b', { style: { color: COLORS.greenLight } }, kpis.noBitrix),
            React.createElement('span', null, 'SINCRONIZADOS NO BITRIX')
          ),
          React.createElement(
            'div',
            { className: 'card kpi' },
            React.createElement('b', { style: { color: COLORS.red } }, `${kpis.taxaDesq}%`),
            React.createElement('span', null, 'DESQUALIFICAÇÃO')
          )
        ),

        // 2-Column Charts Grid
        React.createElement(
          'div',
          { className: 'grid', style: { gridTemplateColumns: '1.4fr 1fr', gap: '16px', marginBottom: '16px' } },
          
          // Chart 1: Daily Activity Composed Chart
          React.createElement(
            'section',
            { className: 'card', style: { padding: '16px' } },
            React.createElement(
              'div',
              { className: 'head', style: { background: 'transparent', borderBottom: '1px solid var(--line)', padding: '0 0 10px', marginBottom: '12px' } },
              React.createElement('h2', { style: { fontSize: '13px' } }, '📈 Evolução Diária de Atividade SDR')
            ),
            React.createElement(
              'div',
              { style: { width: '100%', height: 280 } },
              React.createElement(
                ResponsiveContainer,
                { width: '100%', height: '100%' },
                React.createElement(
                  ComposedChart,
                  { data: dailyData, margin: { top: 10, right: 10, left: -20, bottom: 0 } },
                  React.createElement(CartesianGrid, { strokeDasharray: '3 3', stroke: 'rgba(0,0,0,0.06)' }),
                  React.createElement(XAxis, { dataKey: 'dia', tick: { fontSize: 11 } }),
                  React.createElement(YAxis, { tick: { fontSize: 11 } }),
                  React.createElement(Tooltip, {
                    contentStyle: { background: 'var(--card)', borderColor: 'var(--line)', borderRadius: '10px', fontSize: '11px' }
                  }),
                  React.createElement(Legend, { wrapperStyle: { fontSize: '11px', paddingTop: '8px' } }),
                  React.createElement(Bar, { dataKey: 'tratados', name: 'Tratados', fill: COLORS.orange, radius: [4, 4, 0, 0] }),
                  React.createElement(Bar, { dataKey: 'contatos', name: 'Contatos', fill: COLORS.blue, radius: [4, 4, 0, 0] }),
                  React.createElement(Line, { type: 'monotone', dataKey: 'reunioes', name: 'Reuniões', stroke: COLORS.green, strokeWidth: 3, dot: { r: 4 } }),
                  React.createElement(Line, { type: 'monotone', dataKey: 'oportunidades', name: 'Oportunidades', stroke: COLORS.purple, strokeWidth: 2, strokeDasharray: '4 4' })
                )
              )
            )
          ),

          // Chart 2: Treatment Outcomes Donut Chart
          React.createElement(
            'section',
            { className: 'card', style: { padding: '16px' } },
            React.createElement(
              'div',
              { className: 'head', style: { background: 'transparent', borderBottom: '1px solid var(--line)', padding: '0 0 10px', marginBottom: '12px' } },
              React.createElement('h2', { style: { fontSize: '13px' } }, '🎯 Distribuição dos Desfechos de Atendimento')
            ),
            React.createElement(
              'div',
              { style: { width: '100%', height: 280 } },
              React.createElement(
                ResponsiveContainer,
                { width: '100%', height: '100%' },
                React.createElement(
                  PieChart,
                  null,
                  React.createElement(
                    Pie,
                    {
                      data: outcomePieData,
                      cx: '50%',
                      cy: '50%',
                      innerRadius: 55,
                      outerRadius: 85,
                      paddingAngle: 3,
                      dataKey: 'value'
                    },
                    outcomePieData.map((entry, index) =>
                      React.createElement(Cell, { key: `cell-${index}`, fill: OUTCOME_COLORS[index % OUTCOME_COLORS.length] })
                    )
                  ),
                  React.createElement(Tooltip, {
                    contentStyle: { background: 'var(--card)', borderColor: 'var(--line)', borderRadius: '10px', fontSize: '11px' }
                  }),
                  React.createElement(Legend, {
                    layout: 'horizontal',
                    verticalAlign: 'bottom',
                    align: 'center',
                    wrapperStyle: { fontSize: '10px', maxHeight: '60px', overflowY: 'auto' }
                  })
                )
              )
            )
          )
        ),

        // Row 2: Pomodoro Focus Minutes AreaChart & Pipeline Funnel BarChart
        React.createElement(
          'div',
          { className: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '16px' } },

          // Chart 3: Pomodoro Focus AreaChart
          React.createElement(
            'section',
            { className: 'card', style: { padding: '16px' } },
            React.createElement(
              'div',
              { className: 'head', style: { background: 'transparent', borderBottom: '1px solid var(--line)', padding: '0 0 10px', marginBottom: '12px' } },
              React.createElement('h2', { style: { fontSize: '13px' } }, '⏱️ Dedicação Pomodoro • Minutos de Foco por Dia')
            ),
            React.createElement(
              'div',
              { style: { width: '100%', height: 240 } },
              React.createElement(
                ResponsiveContainer,
                { width: '100%', height: '100%' },
                React.createElement(
                  AreaChart,
                  { data: dailyData, margin: { top: 10, right: 10, left: -20, bottom: 0 } },
                  React.createElement('defs', null,
                    React.createElement('linearGradient', { id: 'pomGradient', x1: '0', y1: '0', x2: '0', y2: '1' },
                      React.createElement('stop', { offset: '5%', stopColor: COLORS.orange, stopOpacity: 0.8 }),
                      React.createElement('stop', { offset: '95%', stopColor: COLORS.orange, stopOpacity: 0.05 })
                    )
                  ),
                  React.createElement(CartesianGrid, { strokeDasharray: '3 3', stroke: 'rgba(0,0,0,0.06)' }),
                  React.createElement(XAxis, { dataKey: 'dia', tick: { fontSize: 11 } }),
                  React.createElement(YAxis, { tick: { fontSize: 11 } }),
                  React.createElement(Tooltip, {
                    contentStyle: { background: 'var(--card)', borderColor: 'var(--line)', borderRadius: '10px', fontSize: '11px' }
                  }),
                  React.createElement(Area, {
                    type: 'monotone',
                    dataKey: 'minutosFoco',
                    name: 'Minutos de Foco',
                    stroke: COLORS.orange,
                    fillOpacity: 1,
                    fill: 'url(#pomGradient)'
                  })
                )
              )
            )
          ),

          // Chart 4: Funnel Pipeline Distribution BarChart
          React.createElement(
            'section',
            { className: 'card', style: { padding: '16px' } },
            React.createElement(
              'div',
              { className: 'head', style: { background: 'transparent', borderBottom: '1px solid var(--line)', padding: '0 0 10px', marginBottom: '12px' } },
              React.createElement('h2', { style: { fontSize: '13px' } }, '🏷️ Leads Ativos por Etapa do Pipeline')
            ),
            React.createElement(
              'div',
              { style: { width: '100%', height: 240 } },
              React.createElement(
                ResponsiveContainer,
                { width: '100%', height: '100%' },
                React.createElement(
                  BarChart,
                  { data: funnelStageData, layout: 'vertical', margin: { top: 5, right: 15, left: 20, bottom: 5 } },
                  React.createElement(CartesianGrid, { strokeDasharray: '3 3', stroke: 'rgba(0,0,0,0.06)' }),
                  React.createElement(XAxis, { type: 'number', tick: { fontSize: 11 } }),
                  React.createElement(YAxis, { type: 'category', dataKey: 'stage', tick: { fontSize: 10 }, width: 110 }),
                  React.createElement(Tooltip, {
                    contentStyle: { background: 'var(--card)', borderColor: 'var(--line)', borderRadius: '10px', fontSize: '11px' }
                  }),
                  React.createElement(Bar, { dataKey: 'total', name: 'Leads', fill: COLORS.blue, radius: [0, 4, 4, 0] })
                )
              )
            )
          )
        )
      );
    }

    const root = ReactDOM.createRoot(rootEl);
    root.render(React.createElement(SDRDashboard));
  }

  window.renderRechartsDashboard = initDashboardComponent;
})();
