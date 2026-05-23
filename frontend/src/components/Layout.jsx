import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Phone, LayoutDashboard, History,
  LogOut, Wifi, WifiOff, Shield, Eye,
} from 'lucide-react';

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col p-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 mb-8 px-1">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Phone className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100 leading-none">Issabel</div>
            <div className="text-xs text-slate-500 leading-none mt-0.5">Call Monitor</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1">
          <p className="text-xs text-slate-600 uppercase tracking-wider px-3 mb-2">Monitoreo</p>
          <NavItem to="/"          icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/historical" icon={History}         label="Histórico" />
        </nav>

        {/* User */}
        <div className="border-t border-slate-800 pt-4 mt-4">
          <div className="flex items-center gap-2 px-2 mb-3">
            <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center shrink-0">
              {user?.role === 'admin'
                ? <Shield className="w-4 h-4 text-blue-400" />
                : <Eye className="w-4 h-4 text-slate-400" />
              }
            </div>
            <div className="overflow-hidden">
              <div className="text-sm font-medium text-slate-200 truncate">{user?.username}</div>
              <div className="text-xs text-slate-500 capitalize">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
